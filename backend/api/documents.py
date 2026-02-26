from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.fhir_builder.diagnostic_report import build_diagnostic_report
from backend.fhir_builder.discharge_summary import build_discharge_summary_bundle
from backend.models.db_models import Document, get_db
from backend.validator.nhcx_validator import validate_bundle


router = APIRouter(prefix="/documents", tags=["documents"])


@router.patch("/{document_id}/extracted")
async def update_extracted(
    document_id: str,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
) -> dict:
    doc = db.get(Document, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    doc.extracted_data = payload

    if doc.doc_type == "DiagnosticReport":
        resource = build_diagnostic_report(payload)
    else:
        resource = build_discharge_summary_bundle(payload)

    # FHIR resources provide a .dict() method
    doc.fhir_bundle = resource.dict()
    db.add(doc)

    return {"id": doc.id, "fhir_bundle": doc.fhir_bundle}


@router.post("/{document_id}/validate")
async def validate_document(document_id: str, db: Session = Depends(get_db)) -> dict:
    doc = db.get(Document, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if not doc.fhir_bundle:
        raise HTTPException(status_code=400, detail="No FHIR bundle present for document")

    report = validate_bundle(doc.fhir_bundle)
    doc.validation_report = report
    db.add(doc)

    return report


@router.get("/{document_id}/validation")
async def get_validation(document_id: str, db: Session = Depends(get_db)) -> dict:
    doc = db.get(Document, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if not doc.validation_report:
        raise HTTPException(status_code=404, detail="No validation report found")

    return doc.validation_report

