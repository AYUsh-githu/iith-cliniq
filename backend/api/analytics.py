from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.models.db_models import Document, Job, get_db


router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("")
async def get_analytics(db: Session = Depends(get_db)) -> dict:
    total_jobs = db.query(func.count(Job.id)).scalar() or 0

    avg_confidence = db.query(func.avg(Document.confidence)).scalar()
    avg_confidence_val = float(avg_confidence) * 100 if avg_confidence is not None else 0.0

    # Define "pass" as validation_report.status == "ok"
    total_validated = db.query(func.count(Document.id)).filter(Document.validation_report.isnot(None)).scalar() or 0
    total_pass = (
        db.query(func.count(Document.id))
        .filter(
            Document.validation_report.isnot(None),
            func.cast(Document.validation_report["status"], type_=str) == "ok",
        )
        .scalar()
        or 0
    )
    pass_rate = float(total_pass) / total_validated * 100 if total_validated else 0.0

    times = [j.processing_time_seconds for j in db.query(Job).all() if j.processing_time_seconds is not None]
    avg_time_seconds = float(sum(times) / len(times)) if times else 0.0

    return {
        "total_jobs": int(total_jobs),
        "avg_confidence": round(avg_confidence_val, 2),
        "pass_rate": round(pass_rate, 2),
        "avg_time_seconds": round(avg_time_seconds, 2),
    }

