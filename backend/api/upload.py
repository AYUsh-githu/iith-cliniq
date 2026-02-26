import io
import zipfile
from datetime import datetime
from typing import List
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from backend.models.db_models import Document, Job, get_db
from backend.worker import process_job


router = APIRouter(tags=["upload"])


@router.post("/upload")
async def upload_documents(
    files: List[UploadFile] = File(...),
    use_case: str = Form("default"),
    db: Session = Depends(get_db),
) -> dict:
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded")

    pdf_files: list[tuple[str, bytes]] = []

    for upload in files:
        filename = upload.filename or "document"
        content = await upload.read()

        if filename.lower().endswith(".zip"):
            with zipfile.ZipFile(io.BytesIO(content)) as zf:
                for info in zf.infolist():
                    if info.is_dir() or not info.filename.lower().endswith(".pdf"):
                        continue
                    with zf.open(info) as f:
                        pdf_files.append((info.filename, f.read()))
        elif filename.lower().endswith(".pdf"):
            pdf_files.append((filename, content))
        else:
            raise HTTPException(status_code=400, detail="Only PDF or ZIP files are supported")

    if not pdf_files:
        raise HTTPException(status_code=400, detail="No PDF files found in upload")

    job_id = str(uuid4())
    job = Job(
        id=job_id,
        status="queued",
        created_at=datetime.utcnow(),
        document_count=len(pdf_files),
    )
    db.add(job)

    for filename, _content in pdf_files:
        doc = Document(
            id=str(uuid4()),
            job_id=job_id,
            filename=filename,
            status="queued",
        )
        db.add(doc)

    db.flush()

    process_job.delay(job_id)

    return {
        "job_id": job_id,
        "status": job.status,
        "document_count": len(pdf_files),
    }

