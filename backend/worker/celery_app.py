from __future__ import annotations

from celery import Celery

from backend.config import settings


celery_app = Celery(
    "cliniq_worker",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
)

celery_app.conf.update(
    task_default_queue="cliniq",
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    result_expires=3600,
)

# Import tasks so Celery registers them
import backend.worker.tasks  # noqa