#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_DIR="$PROJECT_ROOT/.venv"

python3 -m venv "$VENV_DIR"
source "$VENV_DIR/bin/activate"

pip install --upgrade pip
pip install -r "$PROJECT_ROOT/backend/requirements.txt"

echo "Environment ready. Activate with:"
echo "  source $VENV_DIR/bin/activate"
echo "Run API server with:"
echo "  uvicorn backend.main:app --reload"

