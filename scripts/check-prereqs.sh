#!/usr/bin/env bash
# Checks what `make dev` needs on a fresh machine and says how to get anything missing.
set -uo pipefail
missing=0

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "missing: $1. $2"
    missing=1
  fi
}

need docker "Install Docker Desktop (or Docker Engine) and start it."
need node "Install Node.js 20 or newer."
need uv "Install uv: curl -LsSf https://astral.sh/uv/install.sh | sh"
need curl "Install curl."
need python3 "Install Python 3."

if command -v docker >/dev/null 2>&1 && ! docker info >/dev/null 2>&1; then
  echo "docker is installed but not running. Start Docker and try again."
  missing=1
fi
if command -v node >/dev/null 2>&1; then
  major=$(node -p 'process.versions.node.split(".")[0]')
  if (( major < 20 )); then
    echo "node $major is too old; Vaada needs 20 or newer."
    missing=1
  fi
fi
if ! command -v pnpm >/dev/null 2>&1; then
  if command -v corepack >/dev/null 2>&1; then
    corepack enable >/dev/null 2>&1 || true
  fi
  need pnpm "Run: corepack enable (comes with Node), or npm install -g pnpm"
fi

if (( missing )); then
  exit 1
fi
echo "prerequisites ok"
