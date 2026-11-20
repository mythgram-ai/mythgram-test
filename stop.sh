#!/usr/bin/env bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
START_DIR="${MYTHGRAM_START_DIR:-$(pwd)}"

echo "[Mythgram] Stopping services on ports 1000 and 2000..."

if [ -f "$START_DIR/.mythgram/backend.pid" ]; then
  kill -9 "$(cat "$START_DIR/.mythgram/backend.pid")" 2>/dev/null || true
  rm -f "$START_DIR/.mythgram/backend.pid"
fi

if [ -f "$START_DIR/.mythgram/frontend.pid" ]; then
  kill -9 "$(cat "$START_DIR/.mythgram/frontend.pid")" 2>/dev/null || true
  rm -f "$START_DIR/.mythgram/frontend.pid"
fi

fuser -k 1000/tcp 2>/dev/null || true
fuser -k 2000/tcp 2>/dev/null || true

echo "[Mythgram] Stopped both backend (1000) and frontend (2000)."
