import io
import os
import uuid
import zipfile
from pathlib import Path
from typing import List

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.config import settings
from backend.models import Document, Job, SessionLocal
from backend.worker.tasks import process_job

router = APIRouter(tags=["upload"])


def get_db() -> Session:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _validate_use_case(use_case: str) -> None:
    if use_case not in {"claim_submission", "pre_authorisation"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid use_case. Must be 'claim_submission' or 'pre_authorisation'.",
        )


def _validate_and_classify_files(files: List[UploadFile]) -> tuple[list[UploadFile], list[UploadFile]]:
    if not (1 <= len(files) <= 10):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You must upload between 1 and 10 files.",
        )

    pdf_files: list[UploadFile] = []
    zip_files: list[UploadFile] = []

    for f in files:
        filename = f.filename or ""
        ext = Path(filename).suffix.lower()
        if ext == ".pdf":
            pdf_files.append(f)
        elif ext == ".zip":
            zip_files.append(f)
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only PDF or ZIP files are allowed.",
            )

    if zip_files:
        if len(files) != 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="When uploading a ZIP, only one ZIP file is allowed.",
            )
        if pdf_files:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Upload either PDFs or a single ZIP file, not both.",
            )

    return pdf_files, zip_files


def _validate_file_size(upload_file: UploadFile) -> None:
    """Ensure file size is below MAX_PDF_SIZE_MB."""
    spooled = upload_file.file
    current_pos = spooled.tell()
    spooled.seek(0, os.SEEK_END)
    size_bytes = spooled.tell()
    spooled.seek(current_pos, os.SEEK_SET)

    max_bytes = settings.MAX_PDF_SIZE_MB * 1024 * 1024
    if size_bytes > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File '{upload_file.filename}' exceeds maximum size of {settings.MAX_PDF_SIZE_MB} MB.",
        )


@router.post("/upload")
async def upload_documents(
    use_case: str = Form(...),
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db),
):
    """Upload PDFs or a single ZIP containing PDFs and create a processing job."""
    _validate_use_case(use_case)
    pdf_files, zip_files = _validate_and_classify_files(files)

    # Validate sizes before reading
    for f in files:
        _validate_file_size(f)

    job = Job(status="queued", use_case=use_case)
    db.add(job)
    db.commit()
    db.refresh(job)

    job_dir = Path("/tmp/cliniq") / str(job.id)
    job_dir.mkdir(parents=True, exist_ok=True)

    documents_to_create: list[Document] = []

    # Handle direct PDF uploads
    for upload in pdf_files:
        contents = await upload.read()
        filename = upload.filename or f"document-{uuid.uuid4()}.pdf"
        dest_path = job_dir / filename
        dest_path.write_bytes(contents)

        documents_to_create.append(
            Document(
                job_id=job.id,
                filename=filename,
                status="queued",
                doc_type="unknown",
            )
        )

    # Handle ZIP uploads (single ZIP enforced earlier)
    for upload in zip_files:
        zip_bytes = await upload.read()
        filename = upload.filename or f"archive-{uuid.uuid4()}.zip"
        zip_path = job_dir / filename
        zip_path.write_bytes(zip_bytes)

        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            for member in zf.infolist():
                if member.is_dir():
                    continue
                if not member.filename.lower().endswith(".pdf"):
                    continue

                pdf_filename = Path(member.filename).name
                pdf_path = job_dir / pdf_filename

                with zf.open(member) as source, open(pdf_path, "wb") as target:
                    target.write(source.read())

                documents_to_create.append(
                    Document(
                        job_id=job.id,
                        filename=pdf_filename,
                        status="queued",
                        doc_type="unknown",
                    )
                )

    if not documents_to_create:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No PDF documents found in upload.",
        )

    db.add_all(documents_to_create)
    db.commit()

    # Dispatch Celery task
    process_job.delay(str(job.id))

    return {
        "job_id": str(job.id),
        "document_count": len(documents_to_create),
        "status": job.status,
    }


@router.get("/jobs")
def list_jobs(
    page: int = 1,
    per_page: int = 20,
    db: Session = Depends(get_db),
):
    """List jobs with basic aggregate document info."""
    if page < 1 or per_page < 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="page and per_page must be positive integers.",
        )

    query = (
        db.query(
            Job.id,
            Job.status,
            Job.use_case,
            Job.created_at,
            func.count(Document.id).label("document_count"),
            func.avg(Document.doc_type_confidence).label("avg_confidence"),
        )
        .outerjoin(Document)
        .group_by(Job.id)
        .order_by(Job.created_at.desc())
    )

    total_jobs = db.query(func.count(Job.id)).scalar() or 0
    items = (
        query.offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    jobs = [
        {
            "id": str(row.id),
            "status": row.status,
            "use_case": row.use_case,
            "created_at": row.created_at,
            "document_count": int(row.document_count or 0),
            "avg_confidence": float(row.avg_confidence) if row.avg_confidence is not None else None,
        }
        for row in items
    ]

    return {
        "page": page,
        "per_page": per_page,
        "total": total_jobs,
        "items": jobs,
    }


@router.get("/jobs/{job_id}")
def get_job_detail(
    job_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    """Retrieve a single job with all associated documents."""
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found.")

    documents = [
        {
            "id": str(doc.id),
            "filename": doc.filename,
            "status": doc.status,
            "doc_type": doc.doc_type,
            "doc_type_confidence": doc.doc_type_confidence,
            "created_at": doc.created_at,
        }
        for doc in job.documents
    ]

    return {
        "id": str(job.id),
        "status": job.status,
        "use_case": job.use_case,
        "created_at": job.created_at,
        "updated_at": job.updated_at,
        "documents": documents,
    }

