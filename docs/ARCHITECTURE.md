# Architecture

Delta Trader is a read-only market-data spine (Phase 1) with a paper-trading
engine layered on top (Phase 2). All money is `Decimal` end-to-end and serialized
as strings on the wire; per-second state lives in Redis, per-minute aggregates in
TimescaleDB. See the ADRs in `docs/DECISIONS/` for the decision records.

## Foundation (Phase 1) — realtime data spine

```
Delta India (public)                  Backend (single asyncio loop)            Stores
  WS  v2/ticker ─┐                                                             Redis
  candlestick_1m ┤──▶ DeltaWSClient ─▶ tick_normalizer ─▶ latest:{symbol} hashes (TTL 120s)
  spot_price ────┘   (1 shared conn,    spot_indexer        dx:* pub/sub
                      reconnect+resub)        │
  REST /v2/* ───▶ DeltaRestClient ───────────┤──▶ minute_aggregator ─▶ Postgres/Timescale
                  (HMAC, tenacity)            │      (buffer, 5s flush,   ticks_minute (hypertable)
                                              │       COPY + upsert)
                              read-only API ──┴──▶ /products /expiries /option-chain /health
                              frontend WS hub ───▶ /ws  (option_chain, candles; ≤2 Hz)
```

- **Single shared Delta WS** multiplexes all channels; exponential-backoff reconnect
  resubscribes the full desired-set (never silently drops a channel).
- **tick normalizer** parses raw frames to a `Tick` (Decimal; `mark_vol` IV-scaling
  heuristic — see `docs/DELTA_INTEGRATION.md`), writes `latest:{symbol}` and feeds
  the minute buffer.
- **minute aggregator** flushes closed 1-minute OHLC buckets to `ticks_minute` via
  asyncpg COPY → temp table → `INSERT … ON CONFLICT DO UPDATE` (idempotent). On a
  DB failure the drained rows are re-buffered, never lost.

## Paper-trade engine (Phase 2) — see ADR 0003

```
            POST /paper/strategies(/execute)            POST /paper/positions/{id}/close
React UI ─────────────▶ api/paper.py ──▶ PaperEngine ──┬─▶ executor (entry walk)
   │                                                    └─▶ closer (reverse walk)
   │  WS sub paper_position                                     │
   │                                                  fetch L2 (DeltaRestClient) + marks (Redis)
   ▼                                                   apply slippage (quant/slippage)
 paper:mtm:{id} ◀── PaperMtmWorker ──▶ paper_mtm_minute (Timescale)   persist: strategies,
   (1s snapshot;     (per-second MTM,      (per-minute COPY upsert)    paper_positions/legs/fills,
    WS hub polls)     5s flush + reload)                               paper_events (audit)
```

### Execution + slippage (`quant/slippage.py`, `paper/executor.py`)
A market order walks the L2 book — **buy walks asks, sell walks bids** — producing
a size-weighted VWAP, then a **linear impact penalty**:

```
notional    = vwap * qty * contract_size
impact      = vwap * (k * notional / vol_24h)     # k default 0.0001
fill_price  = vwap + impact  (buy)  |  vwap - impact  (sell)
```

`vol_24h` is the symbol's 24h turnover (`volume * mark` proxy from Redis). When
volume is unknown the book is treated as **illiquid** and a fixed floor fraction
(default 0.005) is applied. If the visible book can't fill the requested size the
leg raises `InsufficientDepthError` and an **atomic** entry is rejected (HTTP 409).
A symbol whose L2 book can't even be fetched is treated as zero-depth (also 409).

### MTM, Greeks, IV, RV
- **MTM**: per-second `unrealized = Σ signed_qty_open*(mark − entry_fill)*contract_size`;
  written to `paper:mtm:{id}` and flushed per-minute to `paper_mtm_minute`.
- **Net Greeks**: `Σ signed_qty*contract_size*leg_greek` (sell = negative).
- **Strategy IV**: |notional|-weighted average of per-leg mark IVs.
- **RV**: the **BTC underlying's** realized vol — historical close-to-close 30d
  (annualize √365) and intraday rolling on 1m bars (annualize √(365·1440)). Not a
  synthetic spread RV.
- **Margin** (estimate only): `max(short_premium_received, 1.5 · worst_case_loss)`
  where worst-case loss is the most-negative expiry payoff over a strike grid.
  The authoritative value would come from Delta's authenticated margin endpoint
  (out of scope; gated behind `live_trading_enabled`).

### Failure modes
Leg expiry → freeze leg + flag; Delta WS drop → MTM uses last-good mark with a
`mark_stale` flag; no orderbook depth → reject (409); MTM worker crash → state
rebuilt from Postgres on restart, idempotent re-flush. See ADR 0003 §11.

## Data stores
- **Redis**: `latest:{symbol}` / `latest:spot:{u}` hashes, `dx:*` + `paper:*`
  pub/sub, `paper:mtm:{id}` snapshots, `idx:*` index sets.
- **TimescaleDB**: `ticks_minute`, `paper_mtm_minute` (hypertables, retention
  policies); `products` (+`contract_size`), `expiries`, `strategies`,
  `paper_positions`, `paper_legs`, `paper_fills`, `paper_events`.

## Performance
Tick-to-MTM stays in-process (WS → normalize → Redis → fan-out), Postgres off the
hot path. Frontend updates are RAF-coalesced (PnL number 4 Hz, chart/greeks 1 Hz);
the WS hub throttles to ≤2 Hz per channel.

## Live monitor (Phase 3) — see ADR 0004
Read-only by default. `services/live/` syncs real positions/orders (authenticated
REST + WS) into Redis, aggregates MTM/Greeks/IV/RV over user-tagged strategies
(reusing `quant/`), and runs a **stop-loss state machine** (ARMED → TRIGGERED →
CLOSING → CLOSED|FAILED, Redis-persisted, restart-resumes). The only write path is
the `closer` (market `reduce_only` orders), gated by a single `require_auth`:
keys → 503, `live_trading_enabled` → 403, per-request `confirm` → 422; a shared
token bucket → 429. `live_mtm_minute` mirrors `paper_mtm_minute`.

## Indicators / IV / RV (Phase 4) — see ADR 0005
Indicators are **pure frontend functions** of the price series (EMA/RSI/MACD/
Bollinger/ATR/ADX, Wilder smoothing, `null` warm-up). The backend persists
`rv_intraday`/`rv_historical` per minute and serves `/positions|strategies/{id}/timeseries`
plus a cached `/spot/candles` proxy. Charts live under detail tabs
(Overview | PnL | Greeks | IV/RV | Spot). See `docs/INDICATORS.md`.

## Production (Phase 5) — see ADR 0006
Single Oracle Always-Free VM: Caddy (TLS, 80/443) → backend (`/api`, `/ws`) +
frontend (static); postgres/redis internal-only. Prod overlay
(`docker-compose.prod.yml`) adds `restart: unless-stopped` + memory limits and
publishes only Caddy; a systemd unit starts it at boot. Observability is an optional
overlay (Prometheus `/metrics` + Grafana). Security: optional `API_BEARER_TOKEN`
gate on `/api/*`, per-IP rate limiting (slowapi), env-driven CORS, nightly `pg_dump`.
See `docs/DEPLOY_ORACLE.md`, `docs/RUNBOOK_BACKUPS.md`, `SECURITY.md`.
