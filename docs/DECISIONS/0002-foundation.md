# 0002 — Phase 1 foundation layer

- **Status**: Accepted
- **Date**: 2026-05-28
- **Deciders**: Project owner, staff architect

## Context
Phase 1 stands up the read-only data spine for Delta Trader: ingest BTC option +
spot data from Delta Exchange India's **public** REST/WS (no API keys), normalize
it, cache the per-second hot state in Redis, persist 1-minute aggregates to
TimescaleDB, and serve a unified WS/REST surface to a read-only React frontend
(option chain + BTC candle chart). Hard constraints from `CLAUDE.md` and
`0001-stack-choice.md`: FastAPI + Postgres/Timescale + Redis + React only — no
Kafka/gRPC/new datastores; money is always `Decimal`, never `float`; per-second
display via Redis, per-minute persistence via Postgres; all Delta WS consumers
must reconnect and resubscribe, never silently dropping a channel. Latency budget:
tick-to-MTM **≤ 200 ms p99**; persistence may lag up to **5 s**.

Underlying for Phase 1 is **BTC only**. This ADR fixes the foundation contracts
(Redis keys, table DDL, message shapes) so Phase 2 (paper engine, auth/live) can
build on a stable spine.

## Decision

### 1. Component diagram
```mermaid
flowchart LR
  subgraph Delta["Delta Exchange India (public)"]
    DWS["WS wss://socket.india.delta.exchange/v2"]
    DREST["REST api.india.delta.exchange"]
  end

  subgraph Backend["FastAPI process (single asyncio loop)"]
    ING["Ingestor\n1 shared WS conn\n+ REST bootstrap"]
    NORM["Normalizer\nraw -> Tick (Decimal)"]
    AGG["Minute-aggregator worker\nbuffer -> OHLC flush"]
    API["REST routes (read-only)"]
    FWS["Frontend WS hub\nfan-out, throttle 2 Hz"]
  end

  subgraph Stores
    REDIS[("Redis\nlatest:* hashes\ndx:* pub/sub")]
    PG[("Postgres + Timescale\nproducts / expiries / ticks_minute")]
  end

  FE["React frontend\noption chain + candle chart"]

  DREST -->|bootstrap products/expiries/candles| ING
  DWS -->|v2/ticker, candlestick_1m, spot_price| ING --> NORM
  NORM -->|HSET latest:{sym}| REDIS
  NORM -->|PUBLISH dx:{channel}| REDIS
  REDIS -->|SUBSCRIBE dx:*| AGG --> PG
  REDIS -->|SUBSCRIBE dx:* + HGETALL| FWS
  API -->|read| REDIS
  API -->|read| PG
  FWS <-->|WS sub/push| FE
  API <-->|REST| FE
```

### 2. WS connection topology — single shared connection (multiplexed)
**Decision:** one shared WS connection to Delta multiplexing **all** channels
(`v2/ticker`, `candlestick_1m`, `spot_price` for `.DEXBTUSD`) via a single
`subscribe` payload with a `channels` array. **Rejected:** one connection per
channel/symbol. Rationale: Delta multiplexes channels on one socket by design, a
single connection means **one** reconnect/resubscribe state machine to get right
(hard rule #6), one heartbeat to track, and no per-socket fan-out races; N
connections multiply failure surface and risk hitting connection limits with zero
latency benefit at one venue / one underlying.

### 3. Tick normalization model
Raw Delta frames are normalized into one frozen pydantic v2 / dataclass shape.
**All money/greek fields are `Decimal`.**
```python
class Tick(BaseModel):                 # frozen, arbitrary_types_allowed
    symbol: str                        # "C-BTC-90000-310125"
    channel: Literal["ticker","spot","candle"]
    ts: datetime                       # tz-aware UTC, source event time
    mark_price: Decimal | None
    iv: Decimal | None                 # SIGMA, already /100  (see gotcha)
    delta: Decimal | None
    gamma: Decimal | None
    theta: Decimal | None
    vega:  Decimal | None
    oi:    Decimal | None
    volume: Decimal | None
    best_bid: Decimal | None
    best_ask: Decimal | None
```
**Delta gotchas baked into the normalizer:**
- `mark_vol` is **IV × 100** → `iv = Decimal(mark_vol) / 100` (store σ, e.g. `0.55`).
- Greeks/prices arrive as **strings** → `Decimal(str_value)`; never `float(...)`.
- Missing/empty greek string → `None`, not `0`.
- `{"type":"heartbeat"}` frames are dropped before normalization.
- `symbol` is the wire key; `product_id` (int) is kept only in the `products` table.

### 4. Redis key schema
| Key | Type | Purpose | TTL |
|---|---|---|---|
| `latest:{symbol}` | hash | per-second snapshot of latest `Tick` fields (all values as Decimal-strings) | 120 s (refreshed each tick) |
| `latest:spot:BTC` | hash | latest `.DEXBTUSD` spot snapshot | 120 s |
| `dx:ticker` | pub/sub | normalized option ticker stream | — |
| `dx:candle` | pub/sub | normalized 1m candle stream | — |
| `dx:spot` | pub/sub | normalized spot stream | — |
| `idx:symbols:BTC` | set | all live BTC option symbols (for fan-out / sub validation) | none |
| `idx:expiries:BTC` | set | expiry codes `DD-MM-YYYY` seen for BTC | none |
| `idx:chain:BTC:{expiry}` | set | symbols belonging to one expiry (option-chain subscribe target) | none |

Hash field names mirror the `Tick` fields verbatim. Publishers `HSET` then
`PUBLISH` so subscribers can `HGETALL` the consistent snapshot. Index sets are
rebuilt on each REST bootstrap and never expire (small, derived from products).

### 5. Postgres schema (Alembic migration runs this raw SQL)
```sql
CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE products (
  product_id     INTEGER PRIMARY KEY,
  symbol         TEXT UNIQUE NOT NULL,
  contract_type  TEXT NOT NULL,            -- call_options | put_options | spot_index
  underlying     TEXT NOT NULL,            -- 'BTC'
  strike         NUMERIC(20,8),
  expiry_code    TEXT,                      -- 'DD-MM-YYYY'
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE expiries (
  underlying  TEXT NOT NULL,
  expiry_code TEXT NOT NULL,               -- 'DD-MM-YYYY'
  expiry_ts   TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (underlying, expiry_code)
);

CREATE TABLE ticks_minute (
  ts          TIMESTAMPTZ NOT NULL,        -- minute bucket start (UTC)
  symbol      TEXT NOT NULL,
  open        NUMERIC(20,8),
  high        NUMERIC(20,8),
  low         NUMERIC(20,8),
  close       NUMERIC(20,8),
  mark_price  NUMERIC(20,8),               -- last mark in bucket
  iv          NUMERIC(10,6),               -- last sigma in bucket
  delta       NUMERIC(10,6),
  gamma       NUMERIC(10,6),
  theta       NUMERIC(10,6),
  vega        NUMERIC(10,6),
  oi          NUMERIC(20,8),
  volume      NUMERIC(20,8),
  PRIMARY KEY (symbol, ts)
);

SELECT create_hypertable('ticks_minute', 'ts',
  chunk_time_interval => INTERVAL '1 day', if_not_exists => TRUE);

CREATE INDEX ix_ticks_minute_symbol_ts ON ticks_minute (symbol, ts DESC);

SELECT add_retention_policy('ticks_minute', INTERVAL '90 days', if_not_exists => TRUE);
```
OHLC is built from `mark_price` per bucket; `mark_price`/greeks/`iv`/`oi` columns
hold the **last** observed value in the minute. Continuous aggregate
`ticks_hourly` (per timeseries-db skill) is deferred to Phase 1.5 chart scaling.

### 6. Minute-aggregation worker
- One asyncio task subscribes to `dx:ticker`, `dx:candle`, `dx:spot`.
- In-memory buffer: `dict[(symbol, minute_bucket)] -> MinuteAccumulator` holding
  `open/high/low/close` from `mark_price`, plus last-seen `iv/greeks/oi/volume`.
- A flush timer fires every **5 s** (within the 5 s persistence-lag budget) and on
  bucket rollover. Flush collects all **closed** minute buckets (bucket < current
  minute) and writes them with **asyncpg `copy_records_to_table`** (COPY) into a
  temp table, then `INSERT ... ON CONFLICT (symbol, ts) DO UPDATE` to upsert —
  giving **idempotency on `(symbol, ts)`** so replays/late ticks never duplicate.
- The current (open) minute bucket stays in the buffer until it closes; only
  Redis serves it for live display.

### 7. Frontend-facing WS protocol
Endpoint `wss://<host>/ws`. Decimals serialized as **strings** (never JS floats).
**Subscribe (client → server):**
```json
{"sub":"option_chain","underlying":"BTC","expiry":"31-01-2025"}
{"sub":"candles","underlying":"BTC","resolution":"1m"}
{"unsub":"option_chain","underlying":"BTC","expiry":"31-01-2025"}
```
**Push (server → client):**
```json
{"ch":"option_chain","underlying":"BTC","expiry":"31-01-2025","ts":"2026-05-28T10:00:01Z",
 "rows":[{"symbol":"C-BTC-90000-310125","mark_price":"1234.50","iv":"0.55",
          "delta":"0.62","gamma":"0.0001","theta":"-12.3","vega":"45.1",
          "oi":"1200","best_bid":"1230.0","best_ask":"1239.0"}]}
{"ch":"candle","underlying":"BTC","resolution":"1m","ts":"2026-05-28T10:00:00Z",
 "open":"68000.0","high":"68120.0","low":"67990.0","close":"68080.0"}
{"ch":"error","msg":"unknown expiry"}
```
- The hub coalesces updates and pushes **≤ 2 Hz per channel** per client (latest
  snapshot wins inside the window) — bounds bandwidth while honoring per-second UX.
- Server resolves an `option_chain` sub to symbols via `idx:chain:BTC:{expiry}`.

### 8. Reconnection / replay strategy
- Delta WS disconnect → **exponential backoff with jitter** (0.5 s → cap 30 s),
  reset on a clean 60 s connection.
- On every (re)connect, **resubscribe ALL** tracked channels from a single source
  of truth (the desired-subscription set held in the ingestor); never rely on the
  server remembering subs (gotcha) and **never silently drop a channel** (rule #6).
- **In-flight minute buffers survive reconnect**: the aggregator buffer lives in
  the worker, independent of the WS task. A gap mid-minute yields a partial OHLC
  for that bucket (logged with a `gap` flag at WARN); the `ON CONFLICT` upsert
  means a later backfill from `/v2/history/candles` can correct it without dupes.
- Stale guard: a `latest:{symbol}` hash older than its 120 s TTL disappears, so
  the frontend renders "stale/no data" rather than a frozen price.

### 9. Failure modes
| Failure | Detection | Handling |
|---|---|---|
| Delta REST **5xx** / rate-limit (429) | status code | token-bucket (~10 rps) + exp-backoff retry; serve last-good from Redis/PG; surface `stale` flag — do not crash bootstrap |
| Delta **WS drop** | recv error / heartbeat gap | exp-backoff reconnect + resubscribe-all; buffers preserved (§8) |
| **Redis down** | conn error | ingest pauses publishing, retries connect; REST read endpoints fall back to Postgres; frontend WS shows degraded; no data loss for closed minutes already in PG |
| **Postgres down** | asyncpg error on flush | aggregator **keeps buffering in memory** and retries flush each cycle (bounded by minute count); Redis hot path + frontend unaffected; alert if backlog > 5 min |

### 10. Trade-offs considered and rejected
- **Kafka / message bus** — rejected: Redis pub/sub covers one-venue fan-out; a broker adds ops weight for no scale benefit.
- **Per-tick Postgres writes** — rejected: violates per-minute-persistence rule and blows the write budget; Redis owns the hot path.
- **Multiple WS connections to Delta** — rejected: multiplies reconnect/heartbeat failure surface with no latency gain (§2).
- **gRPC for the frontend** — rejected: browser WS + JSON is simpler and React-native; no proto toolchain.
- **`float` for prices/greeks** — rejected: hard rule #3; `Decimal` end-to-end, strings on the wire.
- **A second datastore (e.g. Mongo/Influx)** — rejected: TimescaleDB hypertables already cover time-series needs.
- **Server pushing at full tick rate** — rejected: ≤ 2 Hz coalescing protects browser + bandwidth.

## Consequences
- Tick-to-MTM stays in-process (WS → normalize → Redis → fan-out), comfortably
  under 200 ms p99; Postgres is off the hot path.
- One reconnect state machine and one set of contracts make Phase 2 (paper engine,
  auth/live monitor) additive: new channels and `latest:*` keys, same spine.
- Partial minutes on disconnect are accepted and self-heal via history backfill.
- Memory-buffered aggregation tolerates short Postgres outages without data loss.

## 11. Test strategy
- **REST clients** — `respx` to mock `api.india.delta.exchange` responses (products,
  tickers, candles), including 5xx/429 paths for backoff tests.
- **Delta WS client** — in-process `websockets.serve` fake emitting recorded Delta
  frames (ticker w/ string greeks, `mark_vol`, heartbeats); assert resubscribe-all
  fires after a forced server close.
- **Migration + aggregator** — `testcontainers` Postgres+Timescale: run the Alembic
  migration, feed snapshots, assert COPY upsert is idempotent on `(symbol, ts)`.
- **Math/normalization** — `hypothesis` over Decimal inputs for IV `/100`, OHLC
  invariants (`low ≤ open,close ≤ high`), and string→Decimal round-trips.
- **Frontend WS protocol** — contract test asserting ≤ 2 Hz throttle and
  Decimal-as-string serialization.

## Implementation guidance (build in this order)
1. `docker-compose.yml` — postgres+timescale, redis, backend, frontend.
2. `backend/app/db/migrations/` — Alembic migration with the §5 raw SQL.
3. `backend/app/services/delta_rest.py` — public REST bootstrap (products, expiries, candles) + token bucket.
4. `backend/app/services/delta_ws.py` — single shared WS, reconnect/resubscribe state machine.
5. `backend/app/services/normalize.py` — raw → `Tick` (Decimal, IV/100, greeks-as-string).
6. `backend/app/services/cache.py` — Redis `latest:*` HSET + `dx:*` PUBLISH + index sets.
7. `backend/app/workers/aggregator.py` — buffer + 5 s flush + asyncpg COPY upsert.
8. `backend/app/api/` — read-only REST (products, chain, candles) reading Redis→PG.
9. `backend/app/ws/hub.py` — frontend WS hub, sub/unsub, ≤ 2 Hz coalescing.
10. `frontend/src/pages/...` — option chain + BTC candle chart, read-only.
