from __future__ import annotations

import io
import json

import pytest
from fastapi.testclient import TestClient

from backend.classifier.document_classifier import DocumentClassifier
from backend.fhir_builder.diagnostic_report import build_diagnostic_report_bundle
from backend.main import app
from backend.terminology.mapper import TerminologyMapper


client = TestClient(app)


def test_health_check():
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_upload_pdf(monkeypatch):
    # Stub out Celery task to avoid needing a worker
    from backend.worker import tasks

    def dummy_delay(job_id: str):
        return None

    monkeypatch.setattr(tasks.process_job, "delay", dummy_delay)

    # Minimal PDF bytes (not a real PDF but enough for endpoint validation path)
    fake_pdf = b"%PDF-1.4\n%EOF"
    files = {"files": ("test.pdf", io.BytesIO(fake_pdf), "application/pdf")}
    data = {"use_case": "claim_submission"}

    # This test assumes DB is available per local config; it mainly checks request wiring.
    resp = client.post("/api/upload", data=data, files=files)
    assert resp.status_code in (200, 400, 422)
    # If accepted, it should return job metadata
    if resp.status_code == 200:
        body = resp.json()
        assert "job_id" in body
        assert body["status"] == "queued"


def test_classifier_discharge():
    classifier = DocumentClassifier(llm_client=None)
    text = "This is a Discharge Summary. Date of discharge: 2025-01-01. Final discharge diagnosis: Pneumonia."
    result = classifier.classify(text)
    assert result["doc_type"] == "discharge_summary"
    assert result["confidence"] >= 0.85
    assert result["method"] == "rule_based"


def test_terminology_loinc():
    mapper = TerminologyMapper()
    mapping = mapper.map_lab_test("Haemoglobin")
    assert mapping["loinc_code"] == "718-7"
    assert mapping["confidence"] >= 0.9


def test_fhir_bundle_valid_json():
    extracted = {
        "patient": {"name": "John Doe", "gender": "male", "dob": "1980-01-01", "patient_id": "P123"},
        "ordering_physician": {"name": "Dr. Smith"},
        "lab": {"name": "Test Lab"},
        "specimen": {"type": "Blood", "collection_date": "2025-01-01T10:00:00Z"},
        "report_date": "2025-01-01T12:00:00Z",
        "results": [
            {
                "test_name": "Haemoglobin",
                "value": "13.5",
                "unit": "g/dL",
                "reference_range": "13-17",
                "flag": "N",
                "loinc_code": "718-7",
                "confidence": 0.95,
            }
        ],
        "interpretation": "Normal",
        "overall_confidence": 0.95,
    }
    bundle_dict = build_diagnostic_report_bundle(extracted, "doc-1")
    # Should serialize to JSON without errors
    encoded = json.dumps(bundle_dict)
    assert isinstance(encoded, str)
    decoded = json.loads(encoded)
    assert decoded["resourceType"] == "Bundle"

