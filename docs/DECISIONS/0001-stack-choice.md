# 0001 — Stack choice

- **Status**: Accepted
- **Date**: 2026-05-28
- **Deciders**: Project owner

## Context
We are building a Delta Exchange India options trading platform with a paper-trading
section and a live-monitoring section. It needs realtime market data, a per-second MTM
engine, time-series persistence, and a responsive trading-terminal UI.

## Decision
- **Backend**: Python 3.11+, FastAPI (async), websockets, asyncpg, Redis, pydantic v2.
- **Frontend**: React 18 + TypeScript + Vite + Tailwind + Recharts + Lightweight Charts + TanStack Query + Zustand.
- **Database**: Postgres 16 + TimescaleDB; Parquet for cold archival.
- **Infra**: Docker Compose locally; Oracle Cloud Always Free for production.
- **Quality**: ruff + mypy (strict) + pytest (backend); eslint + tsc + vitest + playwright (frontend); pre-commit hooks.

## Consequences
- Single-language-per-tier keeps the team small and the tooling sharp.
- TimescaleDB gives hypertables + continuous aggregates without a second datastore.
- Redis is the hot path for per-second ticks; Postgres only sees per-minute aggregates.
- Trade-off: no Kafka/gRPC — acceptable at this scale (one venue, two underlyings).

## Template for future ADRs
Copy this structure: Context → Decision → Consequences. Number sequentially.
