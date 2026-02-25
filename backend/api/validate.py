from __future__ import annotations

import uuid
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException, Path, status
from sqlalchemy.orm import Session

from backend.fhir_builder.diagnostic_report import build_diagnostic_report_bundle
from backend.fhir_builder.discharge_summary import build_discharge_summary_bundle
from backend.models import AuditLog, Document, SessionLocal
from backend.worker.tasks import validate_document

router = APIRouter(tags=["validate"])


def get_db() -> Session:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _build_nhcx_checklist(fhir_bundle: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Simple NHCX compliance checklist for key required fields."""
    if not fhir_bundle:
        return []

    def has(path: str) -> bool:
        parts = path.split(".")
        cur: Any = fhir_bundle
        for p in parts:
            if isinstance(cur, list):
                try:
                    idx = int(p)
                    cur = cur[idx]
                except (ValueError, IndexError):
                    return False
            elif isinstance(cur, dict):
                if p not in cur:
                    return False
                cur = cur[p]
            else:
                return False
        return cur is not None

    checks = [
        {"field": "resourceType", "required": True},
        {"field": "type", "required": True},
        {"field": "entry", "required": True},
    ]

    # Try to detect DiagnosticReport / DischargeSummary profiles
    checks.extend(
        [
            {
                "field": "entry.0.resource.meta.profile",
                "required": True,
            },
            {
                "field": "entry.0.resource.subject",
                "required": True,
            },
        ]
    )

    for check in checks:
        path = check["field"]
        passed = has(path)
        check["passed"] = passed
        check["message"] = "present" if passed else "missing"

    return checks


@router.post("/documents/{document_id}/validate")
def trigger_validation(
    document_id: uuid.UUID = Path(...),
):
    """Dispatch Celery validation task for a document."""
    validate_document.delay(str(document_id))
    return {"status": "validating", "document_id": str(document_id)}


@router.get("/documents/{document_id}/validation")
def get_validation_report(
    document_id: uuid.UUID = Path(...),
    db: Session = Depends(get_db),
):
    """Return validation report and NHCX compliance checklist for a document."""
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")

    report: Dict[str, Any] = document.validation_report or {}

    # Derive counts if not present
    issues: List[Dict[str, Any]] = report.get("issues") or []
    if issues and not report.get("error_count"):
        errors = sum(1 for i in issues if i.get("severity") in {"error", "fatal"})
        warnings = sum(1 for i in issues if i.get("severity") == "warning")
        infos = len(issues) - errors - warnings
        report["error_count"] = errors
        report["warning_count"] = warnings
        report["info_count"] = infos

    bundle = document.fhir_bundle or {}
    checklist = _build_nhcx_checklist(bundle)

    errors = [i for i in issues if i.get("severity") in {"error", "fatal"}]
    warnings = [i for i in issues if i.get("severity") == "warning"]
    infos = [i for i in issues if i.get("severity") not in {"error", "fatal", "warning"}]

    return {
        "document_id": str(document_id),
        "bundle_health_score": report.get("bundle_health_score", 0),
        "errors": errors,
        "warnings": warnings,
        "info": infos,
        "nhcx_compliance_checklist": checklist,
        "raw_report": report,
    }


def _flatten_dict(prefix: str, value: Any, out: Dict[str, Any]) -> None:
    if isinstance(value, dict):
        for k, v in value.items():
            new_prefix = f"{prefix}.{k}" if prefix else k
            _flatten_dict(new_prefix, v, out)
    elif isinstance(value, list):
        for idx, item in enumerate(value):
            new_prefix = f"{prefix}[{idx}]"
            _flatten_dict(new_prefix, item, out)
    else:
        out[prefix] = value


@router.patch("/documents/{document_id}/extracted")
def patch_extracted_data(
    payload: Dict[str, Any],
    document_id: uuid.UUID = Path(...),
    db: Session = Depends(get_db),
):
    """
    Apply a shallow JSON patch to a document's extracted_data,
    create AuditLog entries for each changed field, and rebuild FHIR bundle.
    """
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")

    extracted: Dict[str, Any] = document.extracted_data or {}

    # Flatten original and patched dict for change tracking
    original_flat: Dict[str, Any] = {}
    _flatten_dict("", extracted, original_flat)

    # Apply shallow patch (top-level merge)
    for key, value in payload.items():
        extracted[key] = value

    new_flat: Dict[str, Any] = {}
    _flatten_dict("", extracted, new_flat)

    # Create AuditLog entries for changed fields
    for path, new_value in new_flat.items():
        old_value = original_flat.get(path, None)
        if old_value != new_value:
            audit = AuditLog(
                document_id=document.id,
                action="human_edited",
                field_path=path,
                old_value=None if old_value is None else str(old_value),
                new_value=None if new_value is None else str(new_value),
                actor="human",
            )
            db.add(audit)

    # Rebuild FHIR bundle based on current doc_type
    doc_type = (document.doc_type or "").lower()
    fhir_bundle: Dict[str, Any] | None = None
    if "diagnostic_report" in doc_type:
        fhir_bundle = build_diagnostic_report_bundle(extracted, str(document.id))
    elif "discharge_summary" in doc_type or "discharge" in doc_type:
        fhir_bundle = build_discharge_summary_bundle(extracted, str(document.id))

    if fhir_bundle is not None:
        document.fhir_bundle = fhir_bundle

    document.extracted_data = extracted
    document.status = "review"
    db.add(document)
    db.commit()
    db.refresh(document)

    return document.extracted_data

