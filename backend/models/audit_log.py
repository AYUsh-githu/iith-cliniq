import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from .database import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id = Column(
        UUID(as_uuid=True),
        ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # "ai_extracted", "human_edited", "validated", "exported"
    action = Column(String, nullable=False)
    field_path = Column(String, nullable=True)
    old_value = Column(Text, nullable=True)
    new_value = Column(Text, nullable=True)

    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False)
    # "ai" or "human"
    actor = Column(String, nullable=False)

    document = relationship("Document", back_populates="audit_logs")

