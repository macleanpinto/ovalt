#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

load_env_file() {
  local file="$1"
  if [[ -f "$file" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$file"
    set +a
  fi
}

# Defaults first, local overrides second.
load_env_file "$ROOT_DIR/.env.example"
load_env_file "$ROOT_DIR/.env"

echo "Starting LocalStack..."
docker compose up -d localstack

cleanup() {
  if [[ -n "${API_PID:-}" ]]; then kill "$API_PID" >/dev/null 2>&1 || true; fi
  if [[ -n "${WORKER_PID:-}" ]]; then kill "$WORKER_PID" >/dev/null 2>&1 || true; fi
  if [[ -n "${WEB_PID:-}" ]]; then kill "$WEB_PID" >/dev/null 2>&1 || true; fi
}

trap cleanup EXIT INT TERM

echo "Starting API, worker, and web..."
npm run dev:api &
API_PID=$!

npm run dev:worker &
WORKER_PID=$!

npm run dev:web &
WEB_PID=$!

wait "$API_PID" "$WORKER_PID" "$WEB_PID"

