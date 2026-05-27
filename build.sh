#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== K8s Manager Build ==="

echo "[1/4] Installing backend dependencies..."
cd "$SCRIPT_DIR/backend"
if [ ! -d "venv" ]; then
    python3 -m virtualenv venv
fi
source venv/bin/activate
pip install -q -r requirements.txt

echo "[2/4] Installing frontend dependencies..."
cd "$SCRIPT_DIR/frontend"
npm install --silent

echo "[3/4] Building frontend..."
npm run build

echo "[4/4] Copying frontend build to backend/static..."
rm -rf "$SCRIPT_DIR/backend/static"
cp -r "$SCRIPT_DIR/frontend/dist" "$SCRIPT_DIR/backend/static"

echo ""
echo "=== Build complete ==="
echo "Run: ./run.sh"
