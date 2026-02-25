from __future__ import annotations

import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Callable

from alembic import command
from alembic.config import Config
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from backend.api import analytics, export, jobs, upload, validate


def _run_migrations() -> None:
    """Run Alembic migrations to latest head."""
    backend_dir = Path(__file__).resolve().parent
    alembic_ini = backend_dir / "alembic.ini"
    if not alembic_ini.exists():
        return

    cfg = Config(str(alembic_ini))
    command.upgrade(cfg, "head")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Run DB migrations on startup
    _run_migrations()
    print("ClinIQ Backend Started")
    yield


def create_app() -> FastAPI:
    app = FastAPI(title="ClinIQ Backend", version="0.1.0", lifespan=lifespan)

    # CORS for development – allow all origins
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Simple request logging middleware
    @app.middleware("http")
    async def log_requests(request: Request, call_next: Callable[[Request], Response]):
        start_time = time.perf_counter()
        response = await call_next(request)
        duration = (time.perf_counter() - start_time) * 1000
        # Basic log line: method path status duration_ms
        print(
            f"{request.method} {request.url.path} -> {response.status_code} "
            f"({duration:.1f} ms)"
        )
        return response

    # Routers
    app.include_router(upload.router, prefix="/api")
    app.include_router(jobs.router, prefix="/api")
    app.include_router(validate.router, prefix="/api")
    app.include_router(export.router, prefix="/api")
    app.include_router(analytics.router, prefix="/api")

    @app.get("/health")
    async def health_check():
        return {"status": "ok"}

    return app


app = create_app()


