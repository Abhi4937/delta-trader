#!/usr/bin/env bash
set -e
cd "$(git rev-parse --show-toplevel)"

# Only lint files that are staged
backend_changed=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.py$' || true)
frontend_changed=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(ts|tsx|js|jsx)$' || true)

if [ -n "$backend_changed" ]; then
  echo "→ Linting backend..."
  (cd backend && ruff check . && ruff format --check . && mypy app/)
fi

if [ -n "$frontend_changed" ]; then
  echo "→ Linting frontend..."
  (cd frontend && pnpm lint && pnpm typecheck)
fi
