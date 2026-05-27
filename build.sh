#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== K8s Manager Build ==="

echo "[1/2] Installing backend dependencies..."
cd "$SCRIPT_DIR/backend"
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi
source venv/bin/activate
pip install -q -r requirements.txt

echo "[2/2] Setting up frontend static files..."
if [ ! -d "$SCRIPT_DIR/backend/static" ]; then
    cp -r "$SCRIPT_DIR/frontend/dist" "$SCRIPT_DIR/backend/static"
    echo "  Copied pre-built frontend to backend/static"
else
    echo "  backend/static already exists, skipping"
fi

echo ""
echo "=== Build complete ==="
echo "Run: ./run.sh"
