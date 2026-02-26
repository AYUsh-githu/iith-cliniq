from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.models.db_models import Document, Job, get_db


router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.get("")
async def list_jobs(db: Session = Depends(get_db)) -> list[dict]:
    jobs = db.query(Job).all()
    result: list[dict] = []
    for job in jobs:
        result.append(
            {
                "id": job.id,
                "status": job.status,
                "document_count": job.document_count,
                "avg_confidence": job.avg_confidence,
                "created_at": job.created_at,
            }
        )
    return result


@router.get("/{job_id}")
async def get_job(job_id: str, db: Session = Depends(get_db)) -> dict:
    job = db.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    documents = (
        db.query(Document)
        .filter(Document.job_id == job_id)
        .order_by(Document.created_at.asc())
        .all()
    )

    docs_payload: list[dict] = []
    for doc in documents:
        summary = None
        if isinstance(doc.extracted_data, dict):
            summary = {
                "keys": list(doc.extracted_data.keys())[:10],
            }
        docs_payload.append(
            {
                "id": doc.id,
                "filename": doc.filename,
                "doc_type": doc.doc_type,
                "status": doc.status,
                "confidence": doc.confidence,
                "extracted_summary": summary,
                "created_at": doc.created_at,
            }
        )

    return {
        "id": job.id,
        "status": job.status,
        "document_count": job.document_count,
        "avg_confidence": job.avg_confidence,
        "created_at": job.created_at,
        "documents": docs_payload,
    }

