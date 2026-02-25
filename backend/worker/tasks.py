from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Dict, List

import httpx

from backend.config import settings
from backend.extraction.pdf_parser import PDFParser
from backend.extraction.section_detector import detect_sections
from backend.classifier.document_classifier import DocumentClassifier
from backend.extraction.llm_extractor import LLMExtractor
from backend.fhir_builder.diagnostic_report import build_diagnostic_report_bundle
from backend.fhir_builder.discharge_summary import build_discharge_summary_bundle
from backend.models import AuditLog, Document, Job, SessionLocal
from backend.terminology import TerminologyMapper
from backend.worker.celery_app import celery_app


logger = logging.getLogger(__name__)


@celery_app.task(name="backend.worker.process_job")
def process_job(job_id: str) -> None:
    """Celery task: orchestrate full processing pipeline for a Job."""
    db = SessionLocal()
    try:
        job: Job | None = db.query(Job).filter(Job.id == job_id).first()
        if not job:
            logger.error("Job %s not found", job_id)
            return

        job.status = "processing"
        db.add(job)
        db.commit()
        db.refresh(job)

        parser = PDFParser()
        classifier = DocumentClassifier()
        extractor = LLMExtractor()
        mapper = TerminologyMapper()

        any_failed = False

        for document in job.documents:
            try:
                _process_single_document(
                    db=db,
                    job=job,
                    document=document,
                    parser=parser,
                    classifier=classifier,
                    extractor=extractor,
                    mapper=mapper,
                )
            except Exception:  # noqa: BLE001
                logger.exception("Error processing document %s", document.id)
                document.status = "failed"
                db.add(document)
                db.commit()
                any_failed = True

        job.status = "failed" if any_failed else "review"
        db.add(job)
        db.commit()
    finally:
        db.close()


def _process_single_document(
    db,
    job: Job,
    document: Document,
    parser: PDFParser,
    classifier: DocumentClassifier,
    extractor: LLMExtractor,
    mapper: TerminologyMapper,
) -> None:
    """Run the full pipeline for a single document, updating DB along the way."""
    # 1. Parsing
    document.status = "parsing"
    db.add(document)
    db.commit()

    job_dir = Path("/tmp/cliniq") / str(job.id)
    file_path = job_dir / document.filename

    parse_result = parser.parse(str(file_path))
    raw_text = parse_result.get("full_text") or ""

    # 2. Classification
    classification = classifier.classify(raw_text)
    doc_type = classification.get("doc_type") or "unknown"
    confidence = float(classification.get("confidence") or 0.0)

    document.raw_text = raw_text
    document.doc_type = doc_type
    document.doc_type_confidence = confidence
    document.status = "extracting"
    db.add(document)
    db.commit()

    # 3. Section detection
    sections = detect_sections(raw_text, doc_type)

    # 4. LLM extraction based on type
    if "diagnostic_report" in doc_type:
        extracted = extractor.extract_diagnostic_report(sections, raw_text)
    elif "discharge_summary" in doc_type or "discharge" in doc_type:
        extracted = extractor.extract_discharge_summary(sections, raw_text)
    else:
        extracted = {}

    # 5. Terminology enrichment
    _enrich_with_terminology(extracted, mapper)

    document.extracted_data = extracted
    document.status = "building_fhir"
    db.add(document)
    db.commit()

    # 6. FHIR bundle building
    fhir_bundle: Dict[str, Any] | None = None
    if "diagnostic_report" in doc_type:
        fhir_bundle = build_diagnostic_report_bundle(extracted, str(document.id))
    elif "discharge_summary" in doc_type or "discharge" in doc_type:
        fhir_bundle = build_discharge_summary_bundle(extracted, str(document.id))

    if fhir_bundle is not None:
        document.fhir_bundle = fhir_bundle

    document.status = "review"
    db.add(document)

    audit = AuditLog(
        document_id=document.id,
        action="ai_extracted",
        field_path="",
        old_value=None,
        new_value=None,
        actor="ai",
    )
    db.add(audit)
    db.commit()


def _enrich_with_terminology(extracted: Dict[str, Any], mapper: TerminologyMapper) -> None:
    """Fill missing LOINC/ICD codes using TerminologyMapper."""
    # Lab results (LOINC)
    results: List[Dict[str, Any]] = extracted.get("results") or []
    for res in results:
        if not res.get("loinc_code") and res.get("test_name"):
            mapping = mapper.map_lab_test(str(res["test_name"]))
            if mapping.get("loinc_code"):
                res["loinc_code"] = mapping["loinc_code"]

    # Diagnoses (ICD-10)
    diagnoses: List[Dict[str, Any]] = extracted.get("diagnoses") or []
    for diag in diagnoses:
        if not diag.get("icd10_code") and diag.get("description"):
            mapping = mapper.map_diagnosis(str(diag["description"]))
            if mapping.get("icd10_code"):
                diag["icd10_code"] = mapping["icd10_code"]


@celery_app.task(name="backend.worker.validate_document")
def validate_document(document_id: str) -> Dict[str, Any] | None:
    """
    Validate a document's FHIR bundle using the HAPI FHIR validator.
    Saves validation_report and updates status on the Document.
    """
    db = SessionLocal()
    try:
        document: Document | None = db.query(Document).filter(Document.id == document_id).first()
        if not document:
            logger.error("Document %s not found", document_id)
            return None

        if not document.fhir_bundle:
            logger.error("Document %s has no FHIR bundle to validate", document_id)
            document.status = "validation_failed"
            db.add(document)
            db.commit()
            return None

        url = settings.HAPI_VALIDATOR_URL.rstrip("/") + "/validate"

        try:
            with httpx.Client(timeout=60.0) as client:
                resp = client.post(url, json=document.fhir_bundle)
        except Exception:  # noqa: BLE001
            logger.exception("Error calling HAPI validator for document %s", document_id)
            document.status = "validation_failed"
            db.add(document)
            db.commit()
            return None

        issues: List[Dict[str, Any]] = []
        error_count = 0
        warning_count = 0
        info_count = 0

        try:
            body = resp.json()
        except Exception:
            body = {}

        for issue in body.get("issue", []):
            severity = (issue.get("severity") or "").lower()
            details = ""
            if issue.get("details") and isinstance(issue["details"], dict):
                details = issue["details"].get("text") or ""
            details = details or issue.get("diagnostics") or ""
            expression = issue.get("expression") or []
            if isinstance(expression, list):
                path = ", ".join(str(e) for e in expression)
            else:
                path = str(expression)

            issues.append(
                {
                    "severity": severity,
                    "details": details,
                    "expression": path,
                }
            )

            if severity in {"error", "fatal"}:
                error_count += 1
            elif severity == "warning":
                warning_count += 1
            else:
                info_count += 1

        bundle_health_score = max(0, 100 - error_count * 10 - warning_count * 3)

        validation_report: Dict[str, Any] = {
            "issues": issues,
            "error_count": error_count,
            "warning_count": warning_count,
            "info_count": info_count,
            "bundle_health_score": bundle_health_score,
            "status_code": resp.status_code,
        }

        document.validation_report = validation_report
        document.status = "validated" if error_count == 0 else "validation_failed"
        db.add(document)
        db.commit()

        return validation_report
    finally:
        db.close()

