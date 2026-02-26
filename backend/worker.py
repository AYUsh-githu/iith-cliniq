from datetime import datetime
from typing import Any

from celery import Celery

from backend.config import REDIS_URL
from backend.models.db_models import Document, Job, SessionLocal


celery_app = Celery(
    "cliniq_worker",
    broker=REDIS_URL,
    backend=REDIS_URL,
)


@celery_app.task
def process_job(job_id: str) -> dict[str, Any]:
    db = SessionLocal()
    try:
        job = db.get(Job, job_id)
        if not job:
            return {"job_id": job_id, "status": "not_found"}

        # Very naive "processing": mark documents completed with dummy confidence.
        for doc in job.documents:
            doc.status = "completed"
            if doc.confidence is None:
                doc.confidence = 0.9

        job.status = "completed"
        job.completed_at = datetime.utcnow()
        db.commit()
        db.refresh(job)
        return {"job_id": job.id, "status": job.status}
    finally:
        db.close()

