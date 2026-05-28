# Delta Trader

A trading platform for **Delta Exchange India** BTC/ETH options — paper trading and live
monitoring, with realtime MTM, Greeks, IV/RV, and a multi-leg strategy builder.

## Sections
- **Paper Trade** — live option chain, multi-leg strategy builder, virtual execution with
  orderbook-based slippage, per-second MTM, live PnL chart, Greeks panel, IV/RV.
- **Live Monitor** — real positions from a Delta account, live PnL, whole-strategy stop-loss,
  live Greeks + RV. Starts read-only.

Shared: BTC spot chart with ADX and pluggable indicators. Per-second display, per-minute
persistence to TimescaleDB, optional Parquet archival.

## Stack
- **Backend**: Python 3.11+, FastAPI (async), websockets, asyncpg, Redis, pydantic v2
- **Frontend**: React 18 + TypeScript + Vite + Tailwind + Recharts + TanStack Query
- **DB**: Postgres 16 + TimescaleDB; Parquet cold archive
- **Infra**: Docker Compose locally, Oracle Cloud Always Free for prod

## Quick start (local)
```bash
cp .env.example .env      # fill in values
./scripts/dev.sh          # docker compose up --build
# open http://localhost:5173
```

## Development
- Branches: feature branches off `develop`; `main` is protected and release-only.
- Backend quality gate: `ruff check . && ruff format . && mypy app/ && pytest -q`
- Frontend quality gate: `pnpm lint && pnpm typecheck && pnpm test`

## License
MIT — see [LICENSE](LICENSE).
