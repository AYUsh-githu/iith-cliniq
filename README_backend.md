## ClinIQ Backend — Local Development Setup

### Prerequisites
- **Python**: 3.11+
- **PostgreSQL**: running locally, database `cliniq` and user `cliniq` with password `cliniq`
- **Redis**: running locally on `localhost:6379`

### Steps
1. **Clone and enter the project**
   - `cd iith-cliniq`

2. **Setup backend environment**
   - `cd backend`
   - `bash setup_local.sh`

3. **Configure environment variables**
   - `cp ../.env.example ../.env`
   - Edit `../.env` and fill in your keys (e.g. `ANTHROPIC_API_KEY`, optional `OPENAI_API_KEY`, etc.)

4. **Run the FastAPI app**
   - From the `backend` directory:
   - `uvicorn main:app --reload --port 8000`

5. **Run Celery worker**
   - In a separate terminal, from the `backend` directory:
   - `celery -A worker.celery_app worker --loglevel=info`

