from __future__ import annotations

import json
import uuid
from datetime import datetime
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException, Path, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from backend.config import settings
from backend.models import AuditLog, Document, Job, SessionLocal

router = APIRouter(tags=["export"])


def get_db() -> Session:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("/documents/{document_id}/fhir")
def get_document_fhir(
    document_id: uuid.UUID = Path(...),
    db: Session = Depends(get_db),
):
    """Return FHIR bundle JSON for a document."""
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")
    if not document.fhir_bundle:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Document does not have a FHIR bundle yet.",
        )
    return JSONResponse(content=document.fhir_bundle, media_type="application/fhir+json")


@router.get("/documents/{document_id}/fhir/download")
def download_document_fhir(
    document_id: uuid.UUID = Path(...),
    db: Session = Depends(get_db),
):
    """Return FHIR bundle as downloadable JSON file."""
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")
    if not document.fhir_bundle:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Document does not have a FHIR bundle yet.",
        )

    filename = f"{document_id}_fhir_bundle.json"
    content = json.dumps(document.fhir_bundle)
    headers = {
        "Content-Disposition": f'attachment; filename="{filename}"',
        "Content-Type": "application/fhir+json",
    }
    return Response(content=content, headers=headers)


@router.get("/jobs/{job_id}/fhir/bundle")
def get_job_fhir_bundle(
    job_id: uuid.UUID = Path(...),
    db: Session = Depends(get_db),
):
    """
    Build a composite FHIR transaction Bundle containing all document bundles in the job.
    Represents the complete NHCX claim submission packet.
    """
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found.")

    entries: List[Dict[str, Any]] = []
    for doc in job.documents:
        if not doc.fhir_bundle:
            continue
        entries.append(
            {
                "fullUrl": f"urn:uuid:{doc.id}",
                "resource": doc.fhir_bundle,
                "request": {"method": "POST", "url": "Bundle"},
            }
        )

    bundle: Dict[str, Any] = {
        "resourceType": "Bundle",
        "type": "transaction",
        "identifier": {"value": str(job_id)},
        "timestamp": datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
        "entry": entries,
    }

    filename = f"{job_id}_nhcx_claim_bundle.json"
    content = json.dumps(bundle)
    headers = {
        "Content-Disposition": f'attachment; filename="{filename}"',
        "Content-Type": "application/fhir+json",
    }
    return Response(content=content, headers=headers)


@router.get("/documents/{document_id}/audit")
def get_document_audit_log(
    document_id: uuid.UUID = Path(...),
    db: Session = Depends(get_db),
):
    """Return all AuditLog entries for a document."""
    logs = (
        db.query(AuditLog)
        .filter(AuditLog.document_id == document_id)
        .order_by(AuditLog.timestamp.asc())
        .all()
    )

    return [
        {
            "timestamp": log.timestamp,
            "actor": log.actor,
            "action": log.action,
            "field_path": log.field_path,
            "old_value": log.old_value,
            "new_value": log.new_value,
        }
        for log in logs
    ]


@router.post("/documents/{document_id}/submit-abdm")
def submit_to_abdm(
    document_id: uuid.UUID = Path(...),
    db: Session = Depends(get_db),
):
    """
    Simulate ABDM sandbox submission.
    Optionally could POST to a real ABDM sandbox endpoint if configured.
    """
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")
    if not document.fhir_bundle:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Document does not have a FHIR bundle yet.",
        )

    # Simulation only: we don't actually POST anywhere here.
    timestamp = datetime.utcnow().replace(microsecond=0).isoformat() + "Z"
    abha_reference = f"ABDM-{uuid.uuid4()}"

    audit = AuditLog(
        document_id=document.id,
        action="exported",
        field_path="submit-abdm",
        old_value=None,
        new_value=f"Submitted to ABDM sandbox with reference {abha_reference}",
        actor="human",
    )
    db.add(audit)
    db.commit()

    return {
        "status": "accepted",
        "abha_reference": abha_reference,
        "timestamp": timestamp,
    }

