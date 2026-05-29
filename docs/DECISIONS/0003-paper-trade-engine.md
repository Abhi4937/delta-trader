# 0003 — Phase 2 paper-trade engine

- **Status**: Accepted
- **Date**: 2026-05-28
- **Deciders**: Project owner, staff architect / quant

## Context
Phase 2 builds **Section 1 (Paper Trade)** on top of the read-only data spine from
ADR 0002. A user composes a multi-leg BTC option strategy in the UI (mirroring
Delta's builder), the backend **virtually executes** it against a live L2
orderbook snapshot with an orderbook-walk + linear-impact slippage model, then
tracks the position with **per-second MTM** (from Redis `latest:{symbol}`) and
**per-minute persistence** (a new Timescale hypertable), surfacing net signed
Greeks, strategy IV, the BTC underlying RV (historical + intraday), realized /
unrealized PnL, and an estimated initial margin.

Hard constraints inherited from `CLAUDE.md` and ADR 0002: money is **`Decimal`**
end-to-end and serialized as **strings** on the wire; per-second display via
Redis, per-minute persistence via Postgres; **no** authenticated/live order code
runs without the `settings.live_trading_enabled` guard — the paper engine touches
**zero** private endpoints and places **zero** real orders. We reuse the existing
spine verbatim: `latest:{symbol}` / `latest:spot:BTC` hashes, `dx:*` pub/sub, the
`ticks_minute` hypertable, the `DeltaRestClient` (`get_l2_orderbook`,
`get_candles`, `get_ticker`), and the minute-buffer-then-COPY-upsert flush
pattern. Slippage is part of the model (rule #5), not an afterthought.

This ADR fixes the paper-engine contracts (data model, execution math, MTM
cadence, schema, API, failure modes) so the live monitor (ADR 0004) can reuse
the quant primitives.

## Decision

### 1. Data model

Two layers: **input DTOs** (pydantic v2, not persisted) and **persisted ORM
rows** (SQLAlchemy, money as `Numeric(20,8)` → `Decimal`).

**Input DTOs** (`paper/models.py`):
```python
class LegSpec(BaseModel):              # one leg the user requests
    symbol: str                        # Delta product symbol e.g. "C-BTC-90000-310125"
    side: Literal["buy", "sell"]
    qty: Decimal                       # contracts, > 0 (always positive; sign derives from side)

class StrategySpec(BaseModel):
    name: str
    underlying: str = "BTC"
    legs: list[LegSpec]                # 1..N legs
    atomic: bool = True                # all-or-nothing entry (see §2)
    note: str | None = None
```

**Persisted rows** (`paper/models.py`, ORM on `app.db.base.Base`):

- `Strategy` — the saved/template spec. Columns: `id BIGINT PK`,
  `name TEXT`, `underlying TEXT`, `spec JSONB` (the raw `StrategySpec` for
  reproducibility), `created_at TIMESTAMPTZ`. A `Strategy` is reusable; executing
  it materializes a `PaperPosition`.
- `PaperPosition` — one live/closed virtual position. Columns: `id BIGINT PK`,
  `strategy_id BIGINT FK→strategies`, `underlying TEXT`, `status` enum
  `('open','partially_closed','closed')`, `opened_at TIMESTAMPTZ`,
  `closed_at TIMESTAMPTZ NULL`, `entry_cost NUMERIC(20,8)` (net premium paid −
  received incl. slippage, sign: + = net debit), `realized_pnl NUMERIC(20,8)`,
  `margin_estimate NUMERIC(20,8)`, `flags JSONB` (e.g. `{"stale":false,"expired_leg":null}`).
- `PaperLeg` — one leg of a position (1:N from position). Columns: `id BIGINT PK`,
  `position_id BIGINT FK→paper_positions`, `symbol TEXT`, `product_id INTEGER`
  (FK→products, integer key for Greeks/contract_size), `side` enum `('buy','sell')`,
  `qty NUMERIC(20,8)` (requested, > 0), `qty_open NUMERIC(20,8)` (still open),
  `contract_size NUMERIC(20,8)`, `entry_fill NUMERIC(20,8)` (per-contract VWAP+impact),
  `exit_fill NUMERIC(20,8) NULL`, `status` enum `('open','partially_closed','closed')`.
- `PaperFill` — immutable fill record (entry **and** close fills), 1:N from leg.
  Columns: `id BIGINT PK`, `leg_id BIGINT FK→paper_legs`, `kind` enum
  `('entry','close')`, `side` enum `('buy','sell')`, `qty NUMERIC(20,8)`,
  `vwap NUMERIC(20,8)` (raw book VWAP), `impact NUMERIC(20,8)` (per-contract penalty),
  `fill_price NUMERIC(20,8)` (vwap ± impact, the price PnL uses), `book_snapshot JSONB`
  (consumed levels for audit), `ts TIMESTAMPTZ`.

**Sign convention** (used everywhere): `signed_qty = qty if side=='buy' else -qty`.
A sell leg carries **negative** qty in all PnL/Greek math.

Relationships: `Strategy 1─N PaperPosition 1─N PaperLeg 1─N PaperFill`.
Status enum is a Postgres `ENUM` (`leg_status`, `position_status`); a position is
`partially_closed` when at least one leg has `qty_open>0` and some fill of
`kind='close'` exists.

### 2. Entry execution — orderbook walk + linear impact

At **execute** time (`paper/executor.py`), for each leg fetch a fresh L2 snapshot
via `DeltaRestClient.get_l2_orderbook(symbol)` (Delta `/v2/l2orderbook/{symbol}`,
levels are `{price, size}` strings → `Decimal`). **Buy walks the asks**
(ascending price); **sell walks the bids** (descending price).

**Walk VWAP** for requested `qty` contracts: consume levels in order, accumulate
`filled` until it reaches `qty`; `vwap = Σ(price_i * take_i) / Σ take_i`.

**Linear impact penalty** (rule #5). Impact is a fraction of price proportional to
order notional vs 24h traded value:
```
notional = vwap * qty * contract_size
impact_frac = k * notional / vol_24h           # dimensionless
impact      = vwap * impact_frac               # per-contract price penalty
fill_price  = vwap + impact   (buy)             # you pay up
fill_price  = vwap - impact   (sell)            # you receive less
```
- `vol_24h` = the ticker's 24h **turnover** (quote-currency traded value); read
  from `latest:{symbol}` field `turnover` if present, else `volume * mark_price`,
  else fall back to `get_ticker(symbol)` `turnover`/`volume`. If still unknown or
  `0`, treat as **illiquid** → apply `impact_frac = k_illiquid_floor` (default
  `0.005`, i.e. 50 bps) rather than dividing by zero.
- Default **`k = 0.0001`** (1 bp of price per 1× of 24h turnover consumed),
  configurable via settings: `paper_impact_k: float = 0.0001`,
  `paper_impact_illiquid_floor: float = 0.005`. Computed in `Decimal` (cast `k`
  via `Decimal(str(k))`).

**Depth < requested size — DECISION: reject** (not partial-walk). If the visible
book cannot fill `qty`, the leg execution raises `InsufficientDepth`; the whole
entry fails atomically (see below). Rationale: a partial-walk-plus-extrapolated
impact silently invents liquidity that does not exist and produces a fill the user
never confirmed; rejecting is honest, deterministic, and easy to test. (Partial
**close** also rejects if depth is short of the requested close qty — §7.)

**Atomicity — DECISION: atomic all-or-nothing by default** (`StrategySpec.atomic=True`).
All legs are walked against snapshots captured in one pass; if **any** leg hits
`InsufficientDepth` (or any error), **no** `PaperPosition` is written and a
`paper_events` row records the rejection. With `atomic=False` the executor fills
whatever legs it can and marks the rest rejected in `flags`. Default atomic
because a multi-leg strategy with a missing leg has a completely different risk
profile than intended.

`entry_cost = Σ signed_qty * fill_price * contract_size` (debit positive).

### 3. MTM cadence — per-second Redis, per-minute Timescale

A single asyncio worker `paper/mtm_worker.py` (one task, not one-per-position)
ticks **every 1 s**:
1. Load all `open`/`partially_closed` positions (cached in memory, refreshed on
   create/close events via a `paper:events` pub/sub channel).
2. For each open leg, read the current mark from `latest:{leg.symbol}`
   (`mark_price`, plus `delta/gamma/theta/vega/iv`), all `Decimal`.
3. Compute `unrealized_pnl = Σ signed_qty_open * (mark − entry_fill) * contract_size`,
   net signed Greeks (§4), strategy IV (§5), and write a snapshot to Redis:

   **`paper:mtm:{position_id}`** (hash, TTL 120 s, refreshed each tick), fields:
   `ts, unrealized_pnl, realized_pnl, total_pnl, net_delta, net_gamma, net_theta,
   net_vega, strategy_iv, mark_stale` (all Decimal-as-strings; `mark_stale`="true"
   if any leg mark is older than its 120 s `latest:*` TTL). The worker then
   `PUBLISH`es `paper:position:{id}` for the WS hub (§10).

**Per-minute flush** reuses the ADR 0002 minute-buffer pattern: the worker keeps
`dict[(position_id, minute_bucket)] -> MtmAccumulator` (open/high/low/close of
`total_pnl`, last net Greeks/IV); a **5 s** flush timer + bucket rollover writes
**closed** minute buckets via asyncpg `copy_records_to_table` → temp table →
`INSERT ... ON CONFLICT (position_id, ts) DO UPDATE` into `paper_mtm_minute`
(idempotent, §9). The open minute lives only in Redis.

### 4. Strategy Greeks aggregation

Net signed Greek for the position, per Greek `g ∈ {delta, gamma, theta, vega}`:
```
net_g = Σ_legs  signed_qty_open * contract_size * leg_g
```
where `leg_g` is the per-contract Greek from `latest:{leg.symbol}` (published by
the Phase 1 normalizer), `signed_qty_open` uses the §1 sign convention (**sell →
negative**), and `contract_size` is the per-product multiplier stored on the leg.
For **BTC options on Delta `contract_size = 0.001` BTC** — but we do **not**
hardcode it: `executor` reads `products.contract_size`/contract value at fill time
and persists it on `PaperLeg`, so non-0.001 products (futures, ETH) stay correct
(rule #1: never invent). Implemented in `quant/greeks.py::net_signed_greeks(legs, marks)`.

### 5. Strategy IV — notional-weighted average of per-leg mark IVs

**DECISION:** strategy IV = `Σ |signed_qty_open*fill*contract_size| * leg_iv /
Σ |signed_qty_open*fill*contract_size|` — a **|notional|-weighted** mean of the
per-leg mark IVs (`iv` from `latest:{symbol}`, already σ per ADR 0002 §3).

Rationale vs alternatives: a **simple average** ignores that a 1-lot far-OTM wing
should not move the headline IV as much as a 50-lot ATM core. **ATM-leg IV** is
undefined for strategies with no ATM leg (e.g. a strangle) and discards
information. **Volume weighting** is noisier (per-leg traded volume is sparse for
illiquid strikes) and double-counts liquidity already in the book walk. |Notional|
weighting is stable, always defined for ≥1 priced leg, and reflects where the
capital/risk sits. Implemented in `quant/iv.py::strategy_iv(...)`; legs with
`iv is None` are excluded from both numerator and denominator.

### 6. Strategy RV — BTC underlying RV (two windows)

**DECISION:** use the **BTC underlying's** realized vol, not a synthetic
strategy-spread RV. The underlying series is the BTC perpetual/spot mark from
`ticks_minute` (symbol `BTCUSD` future, falling back to spot `.DEXBTUSD`) — the
same risk factor that drives every leg. A synthetic spread RV is not comparable
to the per-leg IVs and has no clean annualization. `quant/rv.py`:

- **Historical close-to-close 30d**: pull `rv_historical_window_days` (default 30)
  daily closes (1d `ticks_minute` rollup or `get_candles(resolution='1d')`);
  `σ_hist = √365 * stdev(ln(close_t/close_{t-1}))`. (`√365`, crypto 24/7 — matches
  options-math skill.)
- **Intraday rolling**: last `rv_intraday_window_minutes` (default 60) **1m** bars
  from `ticks_minute`; `σ_intra = √(365*1440) * stdev(ln(close_t/close_{t-1}))`.
  Window configurable.

Functions: `rv.py::historical_rv(closes, days=30)` and
`rv.py::intraday_rv(minute_closes, window_min=60)`; both take `Decimal` closes,
compute logs in `Decimal`-safe form, return annualized `Decimal`. RV is a
**position-/underlying-level** field surfaced via the MTM API (§10), refreshed at
a slower 5 s cadence (RV does not need per-second).

### 7. Close execution — reverse walk, partial supported

`paper/closer.py` closes `qty_close ≤ qty_open` of one or more legs. Same slippage
model **in reverse**: closing a **long** leg (`side='buy'`) **sells into the bids**;
closing a **short** leg (`side='sell'`) **buys back from the asks**. Same VWAP walk
+ linear impact (§2), producing an `exit_fill` per closed slice and a
`PaperFill(kind='close')`. Depth-short on close → **reject** the close (position
unchanged), consistent with §2.

**Realized PnL** accumulates per closed slice:
```
realized_pnl += Σ (exit_fill − entry_fill) * signed_qty_closed * contract_size
```
where `signed_qty_closed` uses the original entry sign (a closed short slice has
negative `signed_qty`, so buying back below entry is a profit). Full close (all
`qty_open→0`) sets `status='closed'`, `closed_at=now()`; otherwise
`status='partially_closed'`. `qty_open` decrements; remaining legs keep MTMing.

### 8. Margin — initial estimate (no auth endpoint)

```
margin_estimate = max( short_premium_received , 1.5 * worst_case_loss )
```
- `short_premium_received` = Σ over **sell** legs of `fill_price * qty * contract_size`
  (premium credited; long legs contribute 0 here).
- `worst_case_loss` = max loss of the combined payoff over a **strike grid**: build
  the set of all leg strikes plus `0` and a high cap (`2 * max_strike`), evaluate
  the net option payoff `Σ signed_qty*contract_size*payoff_leg(S_T)` at each grid
  point (call payoff `max(S−K,0)`, put `max(K−S,0)`), subtract net entry credit/add
  net debit, take the worst (most negative) over the grid → its absolute value.
  The `1.5×` is a buffer for between-strike convexity and gap risk.

This is an **estimate only**. The authoritative portfolio margin comes from Delta's
authenticated `/v2/positions/margined`, which is **out of scope** for paper trading
(gated by `live_trading_enabled`, rule #2). `paper/margin.py::estimate_initial_margin(legs)`;
`flags.margin = "estimate"` is always set so the UI never implies it is exchange-true.

### 9. Database schema (Alembic raw SQL)

```sql
CREATE TYPE position_status AS ENUM ('open','partially_closed','closed');
CREATE TYPE leg_status      AS ENUM ('open','partially_closed','closed');
CREATE TYPE leg_side        AS ENUM ('buy','sell');
CREATE TYPE fill_kind       AS ENUM ('entry','close');

CREATE TABLE strategies (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        TEXT NOT NULL,
  underlying  TEXT NOT NULL DEFAULT 'BTC',
  spec        JSONB NOT NULL,                 -- raw StrategySpec
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE paper_positions (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  strategy_id     BIGINT NOT NULL REFERENCES strategies(id),
  underlying      TEXT NOT NULL DEFAULT 'BTC',
  status          position_status NOT NULL DEFAULT 'open',
  opened_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at       TIMESTAMPTZ,
  entry_cost      NUMERIC(20,8) NOT NULL,     -- net debit(+)/credit(-) incl slippage
  realized_pnl    NUMERIC(20,8) NOT NULL DEFAULT 0,
  margin_estimate NUMERIC(20,8) NOT NULL DEFAULT 0,
  flags           JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX ix_paper_positions_status ON paper_positions (status);

CREATE TABLE paper_legs (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  position_id   BIGINT NOT NULL REFERENCES paper_positions(id) ON DELETE CASCADE,
  symbol        TEXT NOT NULL,
  product_id    INTEGER REFERENCES products(product_id),
  side          leg_side NOT NULL,
  qty           NUMERIC(20,8) NOT NULL,       -- requested, > 0
  qty_open      NUMERIC(20,8) NOT NULL,       -- still open
  contract_size NUMERIC(20,8) NOT NULL,       -- e.g. 0.001 for BTC options
  entry_fill    NUMERIC(20,8) NOT NULL,       -- per-contract VWAP ± impact
  exit_fill     NUMERIC(20,8),                -- last close fill (informational)
  status        leg_status NOT NULL DEFAULT 'open'
);
CREATE INDEX ix_paper_legs_position ON paper_legs (position_id);

CREATE TABLE paper_fills (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  leg_id        BIGINT NOT NULL REFERENCES paper_legs(id) ON DELETE CASCADE,
  kind          fill_kind NOT NULL,
  side          leg_side NOT NULL,
  qty           NUMERIC(20,8) NOT NULL,
  vwap          NUMERIC(20,8) NOT NULL,       -- raw book VWAP
  impact        NUMERIC(20,8) NOT NULL,       -- per-contract penalty
  fill_price    NUMERIC(20,8) NOT NULL,       -- vwap ± impact (PnL uses this)
  book_snapshot JSONB NOT NULL,               -- consumed levels, audit
  ts            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_paper_fills_leg ON paper_fills (leg_id);

-- per-minute MTM (Timescale hypertable)
CREATE TABLE paper_mtm_minute (
  position_id    BIGINT NOT NULL REFERENCES paper_positions(id) ON DELETE CASCADE,
  ts             TIMESTAMPTZ NOT NULL,        -- minute bucket start (UTC)
  open           NUMERIC(20,8),               -- total_pnl OHLC in bucket
  high           NUMERIC(20,8),
  low            NUMERIC(20,8),
  close          NUMERIC(20,8),
  unrealized_pnl NUMERIC(20,8),               -- last in bucket
  realized_pnl   NUMERIC(20,8),
  net_delta      NUMERIC(20,8),
  net_gamma      NUMERIC(20,8),
  net_theta      NUMERIC(20,8),
  net_vega       NUMERIC(20,8),
  strategy_iv    NUMERIC(10,6),
  mark_stale     BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (position_id, ts)
);
SELECT create_hypertable('paper_mtm_minute', 'ts',
  chunk_time_interval => INTERVAL '1 day', if_not_exists => TRUE);
CREATE INDEX ix_paper_mtm_minute_pos_ts ON paper_mtm_minute (position_id, ts DESC);
SELECT add_retention_policy('paper_mtm_minute', INTERVAL '180 days', if_not_exists => TRUE);

-- append-only audit log
CREATE TABLE paper_events (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  position_id BIGINT REFERENCES paper_positions(id) ON DELETE SET NULL,
  kind        TEXT NOT NULL,   -- created|executed|rejected|partial_close|closed|leg_expired|mark_stale|worker_recovered
  detail      JSONB NOT NULL DEFAULT '{}'::jsonb,
  ts          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_paper_events_position_ts ON paper_events (position_id, ts DESC);
```
All money columns `NUMERIC(20,8)`; IV `NUMERIC(10,6)` (matches `ticks_minute`).

### 10. API surface (`api/paper.py`)

All money/Greek/IV/RV values are **Decimal-as-strings**. `Decimal` qty in
requests accepted as JSON string or number, parsed to `Decimal`.

| Method | Path | Body / Result |
|---|---|---|
| `GET`  | `/paper/strategies` | list saved `Strategy` (id, name, underlying, spec, created_at) |
| `POST` | `/paper/strategies` | body=`StrategySpec` → persists a `Strategy`, returns `{id,...}` |
| `POST` | `/paper/strategies/execute` | body=`{strategy_id}` **or** inline `StrategySpec` → walks books, creates `PaperPosition`; returns position + per-leg `entry_fill`, `entry_cost`, `margin_estimate`, or `409 {error:"insufficient_depth", symbol}` |
| `GET`  | `/paper/positions` | body none; query `?status=open` → list positions w/ legs + latest `paper:mtm:*` snapshot |
| `POST` | `/paper/positions/{id}/close` | body=`{legs:[{leg_id, qty}]}` optional (omit ⇒ full close) → reverse walk; returns updated status + `realized_pnl`, or `409 insufficient_depth` |
| `GET`  | `/paper/positions/{id}/mtm` | latest MTM snapshot from `paper:mtm:{id}` + underlying RV (hist + intraday); query `?from&to` ⇒ `paper_mtm_minute` history for the PnL chart |

**New WS topic** on the existing `/ws` hub (ADR 0002 §7):
```json
{"sub":"paper_position","id":42}
{"ch":"paper_position","id":42,"ts":"2026-05-29T10:00:01Z",
 "unrealized_pnl":"123.45","realized_pnl":"0","total_pnl":"123.45",
 "net_delta":"0.42","net_gamma":"0.0001","net_theta":"-12.3","net_vega":"45.1",
 "strategy_iv":"0.58","mark_stale":false}
```
The hub resolves a `paper_position` sub by SUBSCRIBE-ing Redis `paper:position:{id}`
(published by the MTM worker §3), throttled ≤ 2 Hz like other channels.

### 11. Failure modes

| Failure | Detection | Handling |
|---|---|---|
| **Leg instrument expires** while position held | `latest:{symbol}` TTL-expires / symbol leaves `idx:symbols:BTC` / expiry_ts passed | freeze that leg: mark stale, last-good `entry_fill`-vs-`mark` MTM frozen at last value; set `flags.expired_leg=symbol`, write `paper_events kind='leg_expired'`; position MTM continues on live legs with a banner; close of an expired leg settles at intrinsic vs last mark |
| **Delta WS drop** (no fresh marks) | `latest:{symbol}` hash older than 120 s TTL (absent) | MTM uses **last-good** Redis mark it cached in-worker; sets `mark_stale=true` on `paper:mtm:*` + WS push; PnL shown with stale flag, not frozen-silently; self-heals when ticks resume (ADR 0002 §8 reconnect) |
| **No orderbook depth at entry** | walk cannot fill `qty` | reject leg → `InsufficientDepth` → atomic entry fails, `409`, `paper_events kind='rejected'` (§2) |
| **No orderbook depth at close** | reverse walk short | reject the close, position unchanged, `409` (§7) |
| **mtm_worker crash** | task supervisor / heartbeat key `paper:mtm:heartbeat` stale | supervisor restarts the task; on boot the worker **rebuilds in-memory state from Postgres** (open positions + legs) and resumes; the open minute bucket is recomputed from current marks (idempotent `ON CONFLICT` upsert means a re-flush is safe); writes `paper_events kind='worker_recovered'` |
| **Redis down** | conn error | MTM pauses publishing + retries; close/execute REST still works against PG + a fresh book fetch; no committed-fill loss (fills are in PG) |

## Flow (create → execute → MTM → close)
```mermaid
sequenceDiagram
  participant FE as React (paper UI)
  participant API as api/paper.py
  participant EX as paper/executor.py
  participant DR as DeltaRestClient
  participant PG as Postgres/Timescale
  participant W as mtm_worker
  participant R as Redis
  FE->>API: POST /paper/strategies (StrategySpec)
  API->>PG: INSERT strategies
  FE->>API: POST /paper/strategies/execute {strategy_id}
  API->>EX: execute(spec)
  loop per leg
    EX->>DR: GET /v2/l2orderbook/{symbol}
    EX->>EX: VWAP walk + impact = k*notional/vol_24h
  end
  alt all legs fillable (atomic)
    EX->>PG: INSERT paper_positions/legs/fills + margin_estimate
    EX-->>API: position
  else any leg short depth
    EX-->>API: 409 insufficient_depth
  end
  loop every 1s
    W->>R: HGETALL latest:{leg.symbol}
    W->>W: unrealized PnL, net Greeks(§4), IV(§5)
    W->>R: HSET paper:mtm:{id} + PUBLISH paper:position:{id}
  end
  loop every 5s
    W->>PG: COPY upsert paper_mtm_minute (closed buckets)
  end
  R-->>FE: WS paper:position:{id} (≤2Hz)
  FE->>API: POST /paper/positions/{id}/close {legs?}
  API->>EX: reverse walk (close), realized PnL(§7)
  EX->>PG: INSERT paper_fills(close); UPDATE legs/position status
```

## Consequences
- The paper engine is purely additive on the ADR 0002 spine: new tables, new
  `paper:*` Redis keys, a new WS topic, **zero** private Delta calls — the
  `live_trading_enabled` guard is never even reached.
- Per-second MTM stays in Redis; Postgres is off the hot path (per-minute COPY
  upsert), keeping tick-to-MTM under the 200 ms p99 budget.
- Slippage is first-class and auditable: every fill stores its VWAP, impact, and
  consumed book snapshot, so a fill can be re-derived and the model back-tested.
- `Decimal` end-to-end with strings on the wire keeps money exact; the OHLC + COPY
  idempotency pattern is reused, so crash recovery and re-flush are safe.
- Margin is explicitly an estimate; the live monitor (ADR 0004) can later swap in
  `/v2/positions/margined` behind the guard without changing the schema.

## Trade-offs considered and rejected
- **Partial-walk on thin books** — rejected: invents liquidity; reject is honest/deterministic (§2).
- **Synthetic spread RV** — rejected: not comparable to per-leg IVs, no clean annualization; underlying RV is the real risk factor (§6).
- **Simple-average / ATM-only strategy IV** — rejected: simple avg over-weights tiny wings; ATM is undefined for many structures (§5).
- **Per-position MTM tasks** — rejected: one worker with an in-memory book of positions is cheaper and matches the single-loop spine.
- **Per-tick MTM persistence** — rejected: violates per-minute rule; Redis owns the hot path (rule #4).
- **`float` anywhere in fills/PnL/margin** — rejected: hard rule #3; `Decimal` end-to-end.
- **Calling Delta's auth margin endpoint for paper** — rejected: rule #2, out of scope; estimate suffices and is flagged as such.

## Test strategy
- **Executor / slippage** — `respx`-mocked `/v2/l2orderbook`: assert buy walks asks /
  sell walks bids, VWAP across multiple levels, impact `= k*notional/vol_24h`, the
  illiquid floor, and `InsufficientDepth` rejection; `hypothesis` over Decimal book
  ladders for VWAP monotonicity and never-negative impact.
- **PnL/Greeks/IV/margin** — unit tests on `quant/*`: signed-qty PnL round-trips
  (long & short legs), net signed Greeks sign correctness, |notional|-weighted IV,
  worst-case-loss on a known spread (e.g. bull call spread max loss = net debit).
- **RV** — fixture BTC minute/daily closes → assert `√365` and `√(365*1440)`
  annualization vs a numpy reference within tol.
- **Migration + MTM flush** — `testcontainers` PG+Timescale: run migration, feed
  snapshots, assert `create_hypertable` and `ON CONFLICT (position_id, ts)`
  idempotency; simulate worker restart → state rebuilt from PG, re-flush is a no-op.
- **API contract** — Decimal-as-string in/out, `409 insufficient_depth`, partial
  close math, WS `paper_position` push shape + ≤ 2 Hz throttle.
- **Failure modes** — expired-leg freeze sets flag; stale Redis mark sets
  `mark_stale=true` not a frozen silent price.

## Implementation guidance (build in this order)
1. `backend/app/services/quant/slippage.py` — `walk_book(levels, side, qty) -> (vwap, filled)`, `impact(vwap, qty, contract_size, vol_24h, k) -> Decimal`, `InsufficientDepth`.
2. `backend/app/services/quant/greeks.py` — `net_signed_greeks(legs, marks)` (§4).
3. `backend/app/services/quant/iv.py` — `strategy_iv(legs, marks)` |notional|-weighted (§5).
4. `backend/app/services/quant/rv.py` — `historical_rv(closes, days)`, `intraday_rv(minute_closes, window_min)` (§6).
5. `backend/app/services/quant/pnl.py` — `unrealized_pnl(...)`, `realized_pnl(...)` (§3, §7).
6. `backend/app/db/migrations/` — Alembic migration with the §9 raw SQL (enums, tables, hypertable, retention).
7. `backend/app/services/paper/models.py` — `StrategySpec`/`LegSpec` DTOs + `Strategy`/`PaperPosition`/`PaperLeg`/`PaperFill` ORM (§1).
8. `backend/app/services/paper/executor.py` — entry walk + impact + atomic write (§2, §8 calls).
9. `backend/app/services/paper/margin.py` — `estimate_initial_margin(legs)` (§8).
10. `backend/app/services/paper/closer.py` — reverse walk + realized PnL + partial/full status (§7).
11. `backend/app/services/paper/engine.py` — orchestration: create/execute/close, `paper_events`, `paper:events` pub/sub fan-out to the worker.
12. `backend/app/services/paper/mtm_worker.py` — 1 s MTM → `paper:mtm:*` + publish; 5 s minute flush (COPY upsert); crash recovery from PG (§3, §11).
13. `backend/app/api/paper.py` — the §10 REST endpoints.
14. `backend/app/ws/hub.py` — add the `paper_position` sub kind subscribing `paper:position:{id}` (§10).
15. Settings additions in `core/config.py`: `paper_impact_k=0.0001`, `paper_impact_illiquid_floor=0.005`, `paper_atomic_default=True` (reuse `risk_free_rate`, `rv_historical_window_days`, `rv_intraday_window_minutes`).
16. `frontend/src/pages/paper/` — strategy builder, PnL chart (`paper_mtm_minute`), Greeks/IV/RV panel, live WS `paper_position`.

## Addendum (orchestrator review — one iteration)
Two corrections to reconcile this ADR with the Phase 1 code as merged:

- **`contract_size` source.** The Phase 1 `products` table has no `contract_size`
  column (cols: product_id, symbol, contract_type, underlying, strike, expiry_code,
  created_at). Phase 2 therefore **adds `contract_size NUMERIC(20,8)` to `products`**
  in the same migration and **populates it during bootstrap** from the Delta product
  field (`contract_value`, e.g. "0.001" for BTC options; default to `Decimal("1")`
  if absent). The executor reads `products.contract_size` and persists it onto
  `PaperLeg.contract_size` at fill time (still "never invent" — sourced from Delta).
- **WS hub file.** The frontend-facing hub is `backend/app/api/stream.py` (a Redis
  **polling** push loop at ≤2 Hz), not `app/ws/hub.py`. The new `paper_position`
  subscription is added there and **polls the `paper:mtm:{id}` hash** each tick
  (consistent with the existing option_chain/candles polling), rather than
  SUBSCRIBE-ing the `paper:position:{id}` pub/sub channel. The worker still writes
  `paper:mtm:{id}` every 1 s; `paper:events` pub/sub is used only for worker
  position-cache invalidation.
