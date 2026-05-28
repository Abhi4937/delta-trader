#!/usr/bin/env bash
set -e
cd "$(git rev-parse --show-toplevel)"

# Only lint files that are staged
backend_changed=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.py$' || true)
frontend_changed=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(ts|tsx|js|jsx)$' || true)

if [ -n "$backend_changed" ]; then
  echo "→ Linting backend..."
  # Use the project venv via uv so ruff/mypy resolve the right interpreter + deps.
  (cd backend && uv run --no-sync ruff check . && uv run --no-sync ruff format --check . && uv run --no-sync mypy app/)
fi

if [ -n "$frontend_changed" ]; then
  echo "→ Linting frontend..."
  (cd frontend && pnpm lint && pnpm typecheck)
fi
