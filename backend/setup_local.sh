#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "Creating virtual environment (venv)..."
python -m venv venv

echo "Activating virtual environment..."
source venv/bin/activate

echo "Installing Python dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

echo "Downloading spaCy model (en_core_web_sm)..."
python -m spacy download en_core_web_sm

echo "Running Alembic migrations..."
alembic upgrade head

echo "Setup complete. Run: uvicorn main:app --reload"

