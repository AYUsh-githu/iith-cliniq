from datetime import datetime
from typing import Any, Generator, Optional

from sqlalchemy import (
    JSON,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    create_engine,
    func,
)
from sqlalchemy.orm import Session, declarative_base, relationship, sessionmaker

from backend.config import DATABASE_URL


Base = declarative_base()


class Job(Base):
    __tablename__ = "jobs"

    id = Column(String, primary_key=True)
    status = Column(String, default="queued", nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    completed_at = Column(DateTime, nullable=True)
    document_count = Column(Integer, default=0, nullable=False)

    documents = relationship("Document", back_populates="job", cascade="all, delete-orphan")
    audit_logs = relationship("AuditLog", back_populates="job", cascade="all, delete-orphan")

    @property
    def avg_confidence(self) -> Optional[float]:
        confidences = [d.confidence for d in self.documents if d.confidence is not None]
        if not confidences:
            return None
        return float(sum(confidences) / len(confidences))

    @property
    def processing_time_seconds(self) -> Optional[float]:
        if not self.completed_at:
            return None
        delta = self.completed_at - self.created_at
        return delta.total_seconds()


class Document(Base):
    __tablename__ = "documents"

    id = Column(String, primary_key=True)
    job_id = Column(String, ForeignKey("jobs.id"), nullable=False, index=True)
    filename = Column(String, nullable=False)
    doc_type = Column(String, nullable=True)
    status = Column(String, default="queued", nullable=False)
    confidence = Column(Float, nullable=True)
    extracted_data = Column(JSON, nullable=True)
    fhir_bundle = Column(JSON, nullable=True)
    validation_report = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    job = relationship("Job", back_populates="documents")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    job_id = Column(String, ForeignKey("jobs.id"), nullable=False, index=True)
    event = Column(String, nullable=False)
    payload = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    job = relationship("Job", back_populates="audit_logs")


if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is not configured")

engine = create_engine(DATABASE_URL, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False, class_=Session)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

