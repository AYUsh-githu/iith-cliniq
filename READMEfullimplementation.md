# ClinIQ — Setup & Run Guide

## Requirements

- **Node.js** ≥ 18
- **Python** ≥ 3.10
- **PostgreSQL** ≥ 14
- **Redis** (Linux/Mac) or **Memurai** (Windows)

---

## One-Time Setup

### 1. Create PostgreSQL Database

```sql
-- Run in psql -U postgres
CREATE USER cliniq WITH PASSWORD 'cliniq';
CREATE DATABASE cliniq OWNER cliniq;
```

### 2. Install Backend Dependencies

```bash
python -m venv venv
.\venv\Scripts\Activate.ps1          # Windows
# source venv/bin/activate           # Linux/Mac

pip install -r backend/requirements.txt
```

### 3. Install Frontend Dependencies

```bash
npm install
```

### 4. Configure `.env`

```env
DATABASE_URL=postgresql://cliniq:cliniq@localhost:1500/cliniq
REDIS_URL=redis://localhost:6379/0
OPENAI_API_KEY=your-key-here
LLM_PROVIDER=openai
MAX_PDF_SIZE_MB=50
```

> Change `1500` to `5432` if using default PostgreSQL port.

---

## Running — 3 Terminals

### Terminal 1 — Backend API

```bash
.\venv\Scripts\Activate.ps1
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

### Terminal 2 — Celery Worker

```bash
.\venv\Scripts\Activate.ps1
celery -A backend.worker.celery_app worker --loglevel=info --pool=solo
```

### Terminal 3 — Frontend

```bash
npm run dev
```

---

## Access

| Service | URL |
|---------|-----|
| Frontend | http://localhost:8080 |
| Backend API | http://localhost:8000 |
| API Docs | http://localhost:8000/docs |

> Make sure PostgreSQL and Redis are running before starting the terminals.
