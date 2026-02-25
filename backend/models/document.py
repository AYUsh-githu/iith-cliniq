import uuid
from datetime import datetime

from sqlalchemy import JSON, Column, DateTime, Float, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from .database import Base


class Document(Base):
    __tablename__ = "documents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    job_id = Column(
        UUID(as_uuid=True),
        ForeignKey("jobs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    filename = Column(String, nullable=False)

    # "discharge_summary", "diagnostic_report_lab", "diagnostic_report_imaging",
    # "prescription", "unknown"
    doc_type = Column(String, nullable=False, default="unknown")
    doc_type_confidence = Column(Float, nullable=True)

    raw_text = Column(Text, nullable=True)
    extracted_data = Column(JSON, nullable=True)
    fhir_bundle = Column(JSON, nullable=True)
    validation_report = Column(JSON, nullable=True)

    status = Column(String, nullable=False, default="queued")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    job = relationship("Job", back_populates="documents")
    audit_logs = relationship(
        "AuditLog",
        back_populates="document",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

