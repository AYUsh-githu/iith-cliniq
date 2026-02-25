from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Depends
from sqlalchemy import and_, func
from sqlalchemy.orm import Session

from backend.models import Document, Job, SessionLocal

router = APIRouter(tags=["analytics"])


def get_db() -> Session:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("/analytics/summary")
def analytics_summary(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Return aggregate analytics about jobs and documents."""
    total_documents = db.query(func.count(Document.id)).scalar() or 0
    total_jobs = db.query(func.count(Job.id)).scalar() or 0

    avg_confidence = (
        db.query(func.avg(Document.doc_type_confidence))
        .filter(Document.doc_type_confidence.isnot(None))
        .scalar()
        or 0.0
    )

    # Average processing time in seconds: job.updated_at - job.created_at
    avg_processing_time_seconds = (
        db.query(
            func.avg(
                func.extract("epoch", Job.updated_at - Job.created_at)  # type: ignore[arg-type]
            )
        )
        .scalar()
        or 0.0
    )

    # Validation pass rate: fraction of documents with status 'validated'
    validated_count = (
        db.query(func.count(Document.id))
        .filter(Document.status == "validated")
        .scalar()
        or 0
    )
    validation_base = (
        db.query(func.count(Document.id))
        .filter(Document.validation_report.isnot(None))
        .scalar()
        or 0
    )
    validation_pass_rate = float(validated_count) / validation_base if validation_base else 0.0

    # Doc type breakdown
    doc_type_rows = (
        db.query(Document.doc_type, func.count(Document.id))
        .group_by(Document.doc_type)
        .all()
    )
    doc_type_breakdown = {row[0] or "unknown": int(row[1] or 0) for row in doc_type_rows}

    # Status breakdown for jobs
    status_rows = (
        db.query(Job.status, func.count(Job.id))
        .group_by(Job.status)
        .all()
    )
    status_breakdown = {row[0]: int(row[1] or 0) for row in status_rows}

    # Time saved: assume 45 minutes manual coding per processed document
    time_saved_minutes = total_documents * 45.0

    return {
        "total_documents": int(total_documents),
        "total_jobs": int(total_jobs),
        "avg_confidence": float(avg_confidence),
        "avg_processing_time_seconds": float(avg_processing_time_seconds),
        "validation_pass_rate": validation_pass_rate,
        "doc_type_breakdown": doc_type_breakdown,
        "time_saved_minutes": time_saved_minutes,
        "status_breakdown": status_breakdown,
    }

