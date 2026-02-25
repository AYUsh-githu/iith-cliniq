from .database import Base, SessionLocal, engine
from .job import Job
from .document import Document
from .audit_log import AuditLog

# Create all tables on import. In production you may prefer Alembic migrations
# instead of automatic metadata creation.
Base.metadata.create_all(bind=engine)

__all__ = [
    "Base",
    "SessionLocal",
    "engine",
    "Job",
    "Document",
    "AuditLog",
]

