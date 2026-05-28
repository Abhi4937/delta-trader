# Delta Trader — Project Brief for Claude

## What this is
A trading platform for **Delta Exchange India** BTC/ETH options. Two sections:

- **Section 1 (Paper Trade)**: live option chain, multi-leg strategy builder mirroring Delta's UX, virtual order execution with orderbook-based slippage + impact model, per-second MTM, live PnL chart, Greeks panel, IV, RV (historical + intraday rolling). All expiries selectable.
- **Section 2 (Live Monitor)**: real positions from Delta account, live PnL, whole-strategy stop-loss placement (not per-leg), live Greeks + RV.

Shared: BTC spot chart with ADX and pluggable indicators. Display per second, persist per minute to TimescaleDB. Optional Parquet archival.

## Stack
- **Backend**: Python 3.11+, FastAPI (async), websockets, asyncpg, Redis, pydantic v2
- **Frontend**: React 18 + TypeScript + Vite + Tailwind + Recharts + TanStack Query
- **DB**: Postgres 16 + TimescaleDB, Parquet for cold archive
- **Infra**: Docker Compose locally, Oracle Cloud Always Free for prod
- **Quality**: ruff + mypy (strict) + pytest backend; eslint + tsc + vitest + playwright frontend; pre-commit hooks

## Hard rules
1. **Never invent Delta API behavior.** Read the docs or the existing client first. Authoritative sources are documented in `docs/DELTA_INTEGRATION.md`.
2. **No live order placement code without a guard.** Every code path that hits Delta's private POST/DELETE endpoints must check `settings.live_trading_enabled` and log the intent at INFO before sending. Section 2 starts read-only.
3. **Money is integers.** Internally, all prices and PnL are stored as Decimal (Python) / number-with-fixed-precision (TS). Never use float for anything that touches PnL or margin.
4. **Per-second display, per-minute persistence.** The hot tick path goes Redis only. Persistence aggregates to 1-minute bars before hitting Postgres.
5. **Slippage is part of the model, not an afterthought.** Paper trades use the L2 orderbook walk + linear impact model. Document the model assumptions in `docs/ARCHITECTURE.md`.
6. **All Delta WebSocket consumers must handle reconnection.** Resubscribe after reconnect. Never silently drop a channel.
7. **Tests are gates, not decoration.** A feature without an integration test against the Delta sandbox (or a recorded fixture) is not done.

## Working agreement with you (Claude)
- **Before changes spanning ≥3 files, ask first** with a 5-line plan.
- **Use the knowledge graph** (`/graphify query "..."`) before grepping for code. Prefer scoped queries over reading whole files.
- **Delegate** to subagents: heavy reads → research subagent, code review before commit → reviewer, test writing → tester. Never inline these in the main session.
- **Brevity in responses.** No "I'll now..." preambles. Just do it and report the diff.
- **When stuck, stop and ask.** Do not guess Delta's behavior. Do not paper over a failing test.
- **Commit style**: conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`). One logical change per commit.

## Where things live
- Delta REST + WS clients: `backend/app/services/delta_*.py`
- Paper engine: `backend/app/services/paper/`
- Live monitor: `backend/app/services/live/`
- Greeks + IV + RV math: `backend/app/services/quant/`
- API routes: `backend/app/api/`
- Frontend pages: `frontend/src/pages/{paper,live}/`
- Shared frontend libs: `frontend/src/lib/`

## When in doubt
1. Check `docs/ARCHITECTURE.md` for the design.
2. Run `/graphify query "<your question>"` to see how existing code is structured.
3. If still unclear, ask me before writing speculative code.
