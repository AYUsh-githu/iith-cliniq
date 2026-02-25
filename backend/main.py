from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.api import upload, jobs, validate, export


def create_app() -> FastAPI:
    app = FastAPI(title="ClinIQ Backend", version="0.1.0")

    # CORS for development – allow all origins
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Routers
    app.include_router(upload.router, prefix="/api")
    app.include_router(jobs.router, prefix="/api")
    app.include_router(validate.router, prefix="/api")
    app.include_router(export.router, prefix="/api")

    @app.get("/health")
    async def health_check():
        return {"status": "ok"}

    @app.on_event("startup")
    async def on_startup():
        print("ClinIQ Backend Started")

    return app


app = create_app()

