#!/usr/bin/env bash
# Rebuild Graphify after every commit (AST only — fast, no API calls)
cd "$(git rev-parse --show-toplevel)"
if command -v graphify >/dev/null 2>&1; then
  graphify update . --no-cluster 2>/dev/null || true
fi
