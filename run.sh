#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/backend"

source venv/bin/activate

HOST="${K8S_MANAGER_HOST:-0.0.0.0}"
PORT="${K8S_MANAGER_PORT:-8000}"

echo "K8s Manager starting on http://${HOST}:${PORT}"
exec uvicorn main:app --host "$HOST" --port "$PORT"
