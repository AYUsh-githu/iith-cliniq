from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.api.upload import router as upload_router
from backend.api.jobs import router as jobs_router
from backend.api.documents import router as documents_router
from backend.api.export import router as export_router
from backend.api.analytics import router as analytics_router
from backend.models.db_models import Base, engine


app = FastAPI(title="ClinIQ API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload_router, prefix="/api")
app.include_router(jobs_router, prefix="/api")
app.include_router(documents_router, prefix="/api")
app.include_router(export_router, prefix="/api")
app.include_router(analytics_router, prefix="/api")


@app.on_event("startup")
def on_startup() -> None:
  # Ensure tables exist
  Base.metadata.create_all(bind=engine)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}

