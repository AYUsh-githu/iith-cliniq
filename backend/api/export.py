from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.models.db_models import Document, get_db


class ExportRequest(BaseModel):
    document_id: str


router = APIRouter(tags=["export"])


@router.post("/export")
async def export_fhir_bundle(
    body: ExportRequest,
    db: Session = Depends(get_db),
):
    doc = db.get(Document, body.document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if not doc.fhir_bundle:
        raise HTTPException(status_code=400, detail="No FHIR bundle present for document")

    return JSONResponse(
        content=doc.fhir_bundle,
        media_type="application/fhir+json",
        headers={"Content-Disposition": f'attachment; filename="{doc.id}.json"'},
    )

