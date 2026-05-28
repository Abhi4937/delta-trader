#!/usr/bin/env bash
# One-command local startup. Copies .env.example to .env if missing, then brings the stack up.
set -e
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "→ No .env found, copying from .env.example"
  cp .env.example .env
fi

docker compose -f infra/docker-compose.yml up --build
