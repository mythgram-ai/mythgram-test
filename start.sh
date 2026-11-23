#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export MYTHGRAM_START_DIR="$(pwd)"

mkdir -p "$MYTHGRAM_START_DIR/.mythgram/logs"

echo "[Mythgram] Starting backend on port 1000 and frontend on port 2000..."
echo "[Mythgram] Default Workspace & DataDir base: $MYTHGRAM_START_DIR"

# Stop any existing instances on port 1000 / 2000
fuser -k 1000/tcp 2>/dev/null || true
fuser -k 2000/tcp 2>/dev/null || true

cd "$SCRIPT_DIR"

# Start backend (port 1000)
nohup npx tsx src/index.ts > "$MYTHGRAM_START_DIR/.mythgram/logs/backend.log" 2>&1 < /dev/null &
BACKEND_PID=$!
echo "$BACKEND_PID" > "$MYTHGRAM_START_DIR/.mythgram/backend.pid"

# Start frontend (port 2000)
cd "$SCRIPT_DIR/webui"
nohup npm run dev > "$MYTHGRAM_START_DIR/.mythgram/logs/frontend.log" 2>&1 < /dev/null &
FRONTEND_PID=$!
echo "$FRONTEND_PID" > "$MYTHGRAM_START_DIR/.mythgram/frontend.pid"

echo "[Mythgram] Backend PID: $BACKEND_PID (http://localhost:1000)"
echo "[Mythgram] Frontend PID: $FRONTEND_PID (http://localhost:2000)"
