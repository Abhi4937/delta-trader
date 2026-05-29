# Graph Report - delta-trader  (2026-05-29)

## Corpus Check
- 165 files · ~63,939 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1621 nodes · 3061 edges · 119 communities (106 shown, 13 thin omitted)
- Extraction: 77% EXTRACTED · 23% INFERRED · 0% AMBIGUOUS · INFERRED: 707 edges (avg confidence: 0.57)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `31d9ed50`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 68|Community 68]]
- [[_COMMUNITY_Community 69|Community 69]]
- [[_COMMUNITY_Community 70|Community 70]]
- [[_COMMUNITY_Community 71|Community 71]]
- [[_COMMUNITY_Community 72|Community 72]]
- [[_COMMUNITY_Community 73|Community 73]]
- [[_COMMUNITY_Community 74|Community 74]]
- [[_COMMUNITY_Community 75|Community 75]]
- [[_COMMUNITY_Community 76|Community 76]]
- [[_COMMUNITY_Community 77|Community 77]]
- [[_COMMUNITY_Community 78|Community 78]]
- [[_COMMUNITY_Community 79|Community 79]]
- [[_COMMUNITY_Community 80|Community 80]]
- [[_COMMUNITY_Community 81|Community 81]]
- [[_COMMUNITY_Community 82|Community 82]]
- [[_COMMUNITY_Community 83|Community 83]]
- [[_COMMUNITY_Community 84|Community 84]]
- [[_COMMUNITY_Community 85|Community 85]]
- [[_COMMUNITY_Community 86|Community 86]]
- [[_COMMUNITY_Community 87|Community 87]]
- [[_COMMUNITY_Community 88|Community 88]]
- [[_COMMUNITY_Community 89|Community 89]]
- [[_COMMUNITY_Community 90|Community 90]]
- [[_COMMUNITY_Community 91|Community 91]]
- [[_COMMUNITY_Community 92|Community 92]]
- [[_COMMUNITY_Community 93|Community 93]]
- [[_COMMUNITY_Community 94|Community 94]]
- [[_COMMUNITY_Community 96|Community 96]]
- [[_COMMUNITY_Community 97|Community 97]]
- [[_COMMUNITY_Community 98|Community 98]]
- [[_COMMUNITY_Community 99|Community 99]]
- [[_COMMUNITY_Community 100|Community 100]]
- [[_COMMUNITY_Community 101|Community 101]]
- [[_COMMUNITY_Community 102|Community 102]]
- [[_COMMUNITY_Community 103|Community 103]]
- [[_COMMUNITY_Community 104|Community 104]]
- [[_COMMUNITY_Community 105|Community 105]]
- [[_COMMUNITY_Community 106|Community 106]]
- [[_COMMUNITY_Community 107|Community 107]]
- [[_COMMUNITY_Community 108|Community 108]]
- [[_COMMUNITY_Community 109|Community 109]]
- [[_COMMUNITY_Community 110|Community 110]]
- [[_COMMUNITY_Community 111|Community 111]]
- [[_COMMUNITY_Community 112|Community 112]]
- [[_COMMUNITY_Community 113|Community 113]]
- [[_COMMUNITY_Community 114|Community 114]]
- [[_COMMUNITY_Community 115|Community 115]]
- [[_COMMUNITY_Community 116|Community 116]]
- [[_COMMUNITY_Community 118|Community 118]]

## God Nodes (most connected - your core abstractions)
1. `RedisBus` - 92 edges
2. `DeltaRestClient` - 41 edges
3. `PaperPosition` - 39 edges
4. `PaperLeg` - 39 edges
5. `StrategySpec` - 36 edges
6. `MinuteBuffer` - 35 edges
7. `Tick` - 32 edges
8. `PaperEngine` - 32 edges
9. `get_bus()` - 29 edges
10. `InsufficientDepthError` - 29 edges

## Surprising Connections (you probably didn't know these)
- `int` --uses--> `Tick`  [INFERRED]
  backend/app/workers/minute_buffer.py → backend/app/models/market.py
- `object` --uses--> `Tick`  [INFERRED]
  backend/app/workers/minute_buffer.py → backend/app/models/market.py
- `RedisBus` --uses--> `RedisBus`  [INFERRED]
  backend/app/services/delta_ws.py → backend/app/services/redis_bus.py
- `ConnectFactory` --uses--> `RedisBus`  [INFERRED]
  backend/app/services/delta_ws.py → backend/app/services/redis_bus.py
- `int` --uses--> `RedisBus`  [INFERRED]
  backend/app/services/delta_ws.py → backend/app/services/redis_bus.py

## Communities (119 total, 13 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.14
Nodes (19): context7, fetch, filesystem, github, memory, playwright, postgres, sequential-thinking (+11 more)

### Community 1 - "Community 1"
Cohesion: 0.11
Nodes (17): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleResolution, noEmit (+9 more)

### Community 2 - "Community 2"
Cohesion: 0.17
Nodes (11): Auth signing (REST), Channels to know, code:json ({"type":"subscribe","payload":{"channels":[{"name":"v2/ticke), Delta Exchange India — API reference, Endpoints, Gotchas, Key REST endpoints, Sandbox (+3 more)

### Community 3 - "Community 3"
Cohesion: 0.20
Nodes (8): code:sql (SELECT create_hypertable('ticks_minute', 'ts', chunk_time_in), code:sql (CREATE MATERIALIZED VIEW ticks_hourly), Continuous aggregates (for charts), Hypertables, Performance rules, Retention + archival, Schema pattern, TimescaleDB conventions for this repo

### Community 4 - "Community 4"
Cohesion: 0.22
Nodes (8): Delta Trader — Project Brief for Claude, graphify, Hard rules, Stack, What this is, When in doubt, Where things live, Working agreement with you (Claude)

### Community 5 - "Community 5"
Cohesion: 0.22
Nodes (8): Greeks, IV inversion, Margin (initial), Options math reference, PnL for a multi-leg position, Pricing model: Black-76 (futures-style, Delta uses this), Put-Call Parity (use as a property test), Realized Volatility

### Community 6 - "Community 6"
Cohesion: 0.22
Nodes (8): code:ts (// hooks/useDeltaStream.ts pattern), Don'ts, Forms, Numbers, Performance: throttling live data, React trading UI patterns, State for live streams, Strategy builder

### Community 7 - "Community 7"
Cohesion: 0.25
Nodes (7): code:bash (cp .env.example .env      # fill in values), Delta Trader, Development, License, Quick start (local), Sections, Stack

### Community 8 - "Community 8"
Cohesion: 0.29
Nodes (6): hooks, PreToolUse, model, permissions, allow, deny

### Community 9 - "Community 9"
Cohesion: 0.29
Nodes (6): Checklist, code:block1 (# commands a reviewer can run), How to test, Screenshots (UI changes), What changed, Why

### Community 10 - "Community 10"
Cohesion: 0.33
Nodes (5): 0001 — Stack choice, Consequences, Context, Decision, Template for future ADRs

### Community 11 - "Community 11"
Cohesion: 0.33
Nodes (5): Environment, Expected, Logs / screenshots, Steps to reproduce, What happened

### Community 12 - "Community 12"
Cohesion: 0.09
Nodes (39): CandleFrame, desiredSubs, ensureSocket(), ErrorFrame, hasWindow(), LivePositionsFrame, LivePositionsListener, livePositionsListeners (+31 more)

### Community 13 - "Community 13"
Cohesion: 0.14
Nodes (13): 2026-05-28 19:36:18 UTC — Autonomous build starting, 2026-05-28 19:37:00 UTC — Pre-flight verification (Block A, Step 0), 2026-05-28 19:40:00 UTC — Phase 0, Step 2 — Create repo + clone, 2026-05-28 19:52:00 UTC — Phase 0, Steps 10-14 + merge, 2026-05-28 20:05:00 UTC — Phase 0, Steps 3-9, 2026-05-28 20:05:00 UTC — Phase 1, Step 1 — ADR, 2026-05-28 20:45:00 UTC — Phase 1, Steps 4-5 — Frontend + full e2e, 2026-05-28 20:55:00 UTC — Phase 1, Steps 2-3 — Infra + backend (+5 more)

### Community 14 - "Community 14"
Cohesion: 0.40
Nodes (4): code:bash (claude mcp list   # should list all 8; approve project serve), MCP Servers, Secrets, Verify

### Community 15 - "Community 15"
Cohesion: 0.40
Nodes (4): Alternatives considered, Problem / motivation, Proposed solution, Scope

### Community 18 - "Community 18"
Cohesion: 0.06
Nodes (44): health(), health_deep(), Health endpoints: ``/health`` (process liveness) and ``/health/deep`` (db + redi, list_expiries(), list_products(), option_chain(), Read-only market metadata + option-chain endpoints., Live option chain. Prefers Redis snapshots; falls back to Delta REST. (+36 more)

### Community 23 - "Community 23"
Cohesion: 0.17
Nodes (11): Architecture, code:block1 (Delta India (public)                  Backend (single asynci), code:block2 (POST /paper/strategies(/execute)            POST /paper/posi), code:block3 (notional    = vwap * qty * contract_size), Data stores, Execution + slippage (`quant/slippage.py`, `paper/executor.py`), Failure modes, Foundation (Phase 1) — realtime data spine (+3 more)

### Community 24 - "Community 24"
Cohesion: 0.22
Nodes (8): Delta Exchange Integration, Endpoints (verified), `mark_vol` scaling differs by transport, Phase 1 scope, Product id field, Product / ticker shapes, Symbol format, Verified quirks (Phase 1)

### Community 35 - "Community 35"
Cohesion: 0.13
Nodes (8): Any, bool, str, Delta WS client test using an in-process websockets server.  Verifies: subscribe, test_ws_subscribes_routes_and_resubscribes(), FakeBus, Shared test fixtures and in-memory fakes (no external services required)., In-memory stand-in for RedisBus capturing latest hashes, pubs, and sets.

### Community 49 - "Community 49"
Cohesion: 0.05
Nodes (52): str, Any, bool, datetime, DeltaRestClient, RedisBus, str, datetime (+44 more)

### Community 50 - "Community 50"
Cohesion: 0.18
Nodes (23): Any, datetime, Decimal, str, Tick, Decimal, Unit tests for tick normalization (Delta gotchas + Decimal safety)., test_dec_parses_and_tolerates_garbage() (+15 more)

### Community 51 - "Community 51"
Cohesion: 0.07
Nodes (26): Any, bool, float, int, object, str, MonkeyPatch, Delta REST client tests with respx-mocked HTTP (recorded-shape fixtures). (+18 more)

### Community 52 - "Community 52"
Cohesion: 0.15
Nodes (11): bytes, float, int, RedisBus, str, ConnectFactory, _default_connect(), DeltaWSClient (+3 more)

### Community 53 - "Community 53"
Cohesion: 0.12
Nodes (16): dependencies, clsx, date-fns, decimal.js, @hookform/resolvers, lightweight-charts, lucide-react, react (+8 more)

### Community 54 - "Community 54"
Cohesion: 0.09
Nodes (21): datetime, float, int, MinuteBuffer, str, int, object, Tick (+13 more)

### Community 55 - "Community 55"
Cohesion: 0.09
Nodes (21): 0002 — Phase 1 foundation layer, 10. Trade-offs considered and rejected, 11. Test strategy, 1. Component diagram, 2. WS connection topology — single shared connection (multiplexed), 3. Tick normalization model, 4. Redis key schema, 5. Postgres schema (Alembic migration runs this raw SQL) (+13 more)

### Community 56 - "Community 56"
Cohesion: 0.09
Nodes (66): close_position(), CloseLegReq, CloseRequest, create_or_preview(), _exec_result_payload(), execute_strategy(), ExecuteRequest, get_engine() (+58 more)

### Community 57 - "Community 57"
Cohesion: 0.15
Nodes (13): str, BaseSettings, get_settings(), Application configuration via pydantic-settings.  Reads from the environment (an, asyncpg DSN used by the application., asyncpg DSN used by the application., asyncpg DSN used by the application., Synchronous DSN used by Alembic migrations. (+5 more)

### Community 58 - "Community 58"
Cohesion: 0.11
Nodes (18): devDependencies, autoprefixer, eslint, eslint-plugin-react-hooks, jsdom, @playwright/test, postcss, tailwindcss (+10 more)

### Community 59 - "Community 59"
Cohesion: 0.06
Nodes (39): useLivePositions(), useLiveStrategies(), useLiveStrategyMtm(), clearStopLoss(), ConflictError, createLiveStrategy(), CreateStrategyResult, deleteJSON() (+31 more)

### Community 60 - "Community 60"
Cohesion: 0.31
Nodes (8): Any, bytes, str, _default(), dumps(), loads(), JSON helpers that serialize ``Decimal`` as strings (never float).  Money safety, Serialize to a JSON string, emitting Decimal as string.

### Community 61 - "Community 61"
Cohesion: 0.06
Nodes (78): Decimal, OrderBook, str, Decimal, ExecutionResult, int, OrderBook, str (+70 more)

### Community 63 - "Community 63"
Cohesion: 0.50
Nodes (3): expirySelect, ivCells, rows

### Community 67 - "Community 67"
Cohesion: 0.13
Nodes (20): Decimal, LegView, str, LegView, LegView, str, net_signed_greeks(), Strategy-level Greek aggregation (ADR 0003 §4).  ``net_g = Σ signed_qty * contra (+12 more)

### Community 68 - "Community 68"
Cohesion: 0.25
Nodes (5): bytes, str, test_spot_indexer_routes_channels(), Spot/candle indexer: same pattern as the tick normalizer but for the BTC spot in, SpotIndexer

### Community 69 - "Community 69"
Cohesion: 0.07
Nodes (62): content, description, content, description, schema, application/json, operationId, parameters (+54 more)

### Community 70 - "Community 70"
Cohesion: 0.09
Nodes (26): CloseLeg, closePosition(), CloseResult, ErrorDetail, executeStrategy(), getJSON(), getPositionMtm(), InsufficientDepthError (+18 more)

### Community 71 - "Community 71"
Cohesion: 0.15
Nodes (14): fmtIvPct(), signClass(), SpotChartProps, fmt(), toDecimal(), CurvePoint, GreeksPanel(), IvPanel() (+6 more)

### Community 72 - "Community 72"
Cohesion: 0.07
Nodes (28): 0003 — Phase 2 paper-trade engine, 10. API surface (`api/paper.py`), 11. Failure modes, 1. Data model, 2. Entry execution — orderbook walk + linear impact, 3. MTM cadence — per-second Redis, per-minute Timescale, 4. Strategy Greeks aggregation, 5. Strategy IV — notional-weighted average of per-leg mark IVs (+20 more)

### Community 73 - "Community 73"
Cohesion: 0.13
Nodes (23): breakevens(), legPayoff(), maxProfitLoss, netEntryCredit(), netGreeks, OptionLeg, optionLegs(), payoffAt() (+15 more)

### Community 74 - "Community 74"
Cohesion: 0.13
Nodes (14): groupByStrike(), LegSpec, PreviewLeg, OptionSide, ParsedSymbol, parseSymbol(), BuilderLeg, CONTRACT_SIZE (+6 more)

### Community 75 - "Community 75"
Cohesion: 0.10
Nodes (22): ExpirySelectorProps, ChainRow, ChainRowProps, findAtmIndex(), OptionChainTableProps, SideCells, SideCellsProps, StrikeRow (+14 more)

### Community 76 - "Community 76"
Cohesion: 0.33
Nodes (4): bytes, test_normalizer_process_updates_redis_and_buffer(), Subscribes to ``dx:ticker`` and updates Redis + the shared minute buffer., TickNormalizer

### Community 77 - "Community 77"
Cohesion: 0.12
Nodes (16): anyOf, items, title, type, title, type, loc, msg (+8 more)

### Community 78 - "Community 78"
Cohesion: 0.13
Nodes (14): addLeg, closeBtn, expirySelect, legRows, midIndex, mtmCell, netDeltaFooter, netThetaFooter (+6 more)

### Community 79 - "Community 79"
Cohesion: 0.12
Nodes (16): usePaperMtm(), isStale(), Mtm, PaperPosition, CurvePoint, PaperPositionDetail(), PaperPositionDetailProps, pnlTone() (+8 more)

### Community 80 - "Community 80"
Cohesion: 0.06
Nodes (30): 0004 — Phase 3 live monitor (Section 2), 10. Failure modes, 1. Auth model & the single gate, 2. Authenticated WS (`live/auth_ws.py`), 3. Position & order sync (`position_sync.py`, `order_sync.py`), 4. Strategy grouping — user-driven, NO auto-cluster, 5. Whole-strategy stop-loss state machine, 6. Leg-close failure handling (+22 more)

### Community 81 - "Community 81"
Cohesion: 0.17
Nodes (11): Choices I made autonomously (from the defaults table + judgment calls), code:powershell (cd C:\dev\Live_Trading_platform\build\delta-trader), Issues for human review (reviewer NITs — deliberately not changed overnight), Morning Report — Delta Trader, Numbers, Recommended next steps in this order, Skipped / Deferred, Status (+3 more)

### Community 82 - "Community 82"
Cohesion: 0.17
Nodes (12): properties, required, title, type, side, symbol, LegSpec, enum (+4 more)

### Community 83 - "Community 83"
Cohesion: 0.20
Nodes (13): useExpiries(), useOptionChain(), usePaperPositions(), useSpotCandles(), useChainStore, Section1Paper(), Tab, TabButtonProps (+5 more)

### Community 84 - "Community 84"
Cohesion: 0.17
Nodes (12): default, title, type, anyOf, title, atomic, note, underlying (+4 more)

### Community 85 - "Community 85"
Cohesion: 0.18
Nodes (11): properties, required, title, type, title, type, leg_id, qty (+3 more)

### Community 86 - "Community 86"
Cohesion: 0.18
Nodes (10): components, schemas, info, title, version, openapi, StrategySpec, required (+2 more)

### Community 87 - "Community 87"
Cohesion: 0.25
Nodes (23): clear_stop_loss(), _gate(), get_strategies(), _mtm_history(), orders(), positions(), post_strategy(), Live monitor REST API (ADR 0004 §9). Read-only by default; stop-loss is the only (+15 more)

### Community 88 - "Community 88"
Cohesion: 0.20
Nodes (10): items, title, type, properties, title, type, $ref, items (+2 more)

### Community 89 - "Community 89"
Cohesion: 0.20
Nodes (10): scripts, build, dev, lint, preview, test, test:e2e, test:e2e:ui (+2 more)

### Community 90 - "Community 90"
Cohesion: 0.22
Nodes (9): properties, title, type, anyOf, minItems, title, type, legs (+1 more)

### Community 91 - "Community 91"
Cohesion: 0.22
Nodes (9): properties, title, type, spec, strategy_id, ExecuteRequest, anyOf, anyOf (+1 more)

### Community 92 - "Community 92"
Cohesion: 0.38
Nodes (5): datetime, minute_floor(), In-memory per-minute aggregation buffer shared by the normalizer (writer) and th, Remove and return accumulators for minutes that have fully closed., Remove and return accumulators for minutes that have fully closed.

### Community 93 - "Community 93"
Cohesion: 0.33
Nodes (5): name, packageManager, private, type, version

### Community 94 - "Community 94"
Cohesion: 0.13
Nodes (8): bool, str, PubSub, Redis, close_bus(), Async Redis client singleton + helpers for the hot path.  Key schema (see docs/D, Thin async wrapper around a shared redis connection pool., RedisBus

### Community 98 - "Community 98"
Cohesion: 0.14
Nodes (16): Any, bool, Decimal, int, RedisBus, str, object, RedisBus (+8 more)

### Community 99 - "Community 99"
Cohesion: 0.15
Nodes (14): Any, RedisBus, Any, Decimal, str, PositionSync, Position sync (ADR 0004 §3): periodic authenticated REST snapshot of real positi, _dec() (+6 more)

### Community 100 - "Community 100"
Cohesion: 0.25
Nodes (13): bool, Decimal, int, str, arm(), disarm(), _event(), _key() (+5 more)

### Community 101 - "Community 101"
Cohesion: 0.16
Nodes (13): object, MonkeyPatch, MonkeyPatch, FakeAsyncpgConn, Records copy + execute calls instead of touching Postgres., Records copy + execute calls instead of touching Postgres., Worker logic tests using in-memory fakes (no Redis/Postgres)., A failed paper MTM flush must NOT drop the closed minute bucket (must-fix #2). (+5 more)

### Community 102 - "Community 102"
Cohesion: 0.25
Nodes (9): bool, datetime, Decimal, str, _d(), _minute(), _MtmAcc, PaperMtmWorker (+1 more)

### Community 103 - "Community 103"
Cohesion: 0.18
Nodes (16): MonkeyPatch, Raise ``AuthGateError`` (carrying 503/403/422) if the call is not permitted., require_auth(), keys_live(), keys_read_only(), no_keys(), Live monitor: auth gate, token bucket, closer, SL state machine (ADR 0004).  All, test_closer_blocked_without_gate() (+8 more)

### Community 104 - "Community 104"
Cohesion: 0.24
Nodes (13): bool, Decimal, float, int, black76_price(), implied_vol(), _norm_cdf(), _norm_pdf() (+5 more)

### Community 105 - "Community 105"
Cohesion: 0.14
Nodes (14): default, title, type, confirm, threshold_abs, threshold_pct, StopLossReq, properties (+6 more)

### Community 106 - "Community 106"
Cohesion: 0.22
Nodes (8): Any, RedisBus, str, Exception, AuthGateError, Carries the HTTP status the API should return for a failed gate check., OrderSync, Order sync (ADR 0004 §3): periodic authenticated snapshot of open orders to Redi

### Community 107 - "Community 107"
Cohesion: 0.15
Nodes (13): type, title, type, items, title, type, name, position_ids (+5 more)

### Community 108 - "Community 108"
Cohesion: 0.21
Nodes (8): bool, get_auth_bucket(), keys_present(), The single authentication gate for all live (real-money) Delta access (ADR 0004, Async token bucket shared by every authenticated Delta call., Take one token. ``block=False`` raises RateLimitError when empty., TokenBucket, test_token_bucket_exhausts_then_refills()

### Community 109 - "Community 109"
Cohesion: 0.33
Nodes (8): Decimal, LegView, entry_cost(), PnL math for paper positions (ADR 0003 §3, §7). All Decimal.  - entry_cost  = su, Mark-to-market PnL on open legs. Legs with no mark contribute 0., Realized PnL for one closed slice (signed_qty uses the entry sign)., realized_pnl_slice(), unrealized_pnl()

### Community 110 - "Community 110"
Cohesion: 0.44
Nodes (8): Decimal, historical_rv(), intraday_rv(), _log_returns(), r"""Realized volatility of the BTC underlying (ADR 0003 §6).  Both are close-to-, Annualized close-to-close RV from daily closes (``√365``)., Annualized close-to-close RV from 1-minute closes (``√(365*1440)``)., _sample_stdev()

### Community 111 - "Community 111"
Cohesion: 0.36
Nodes (7): int, object, str, create_strategy(), list_strategies(), User-driven strategy grouping (ADR 0004 §4): tag positions into a named strategy, strategy_symbols()

### Community 112 - "Community 112"
Cohesion: 0.25
Nodes (6): AGGREGATE, banner, checkboxes, confirmBtn, POSITIONS, strategyRow

### Community 113 - "Community 113"
Cohesion: 0.29
Nodes (6): 0. One-time setup, 1. The drill (do not skip — this is the only real validation of the write path), 2. What to watch / record, 3. Turning it off, code:block1 (DELTA_BASE_URL=https://cdn-ind.testnet.deltaex.org   # verif), Runbook — Live Monitor (Section 2) testnet drill

### Community 114 - "Community 114"
Cohesion: 0.40
Nodes (3): float, int, str

### Community 115 - "Community 115"
Cohesion: 0.40
Nodes (5): RedisBus, str, aggregate(), LiveAggregate, Aggregated live MTM over a tagged strategy (ADR 0004 §3, §4).  Reuses the paper

### Community 116 - "Community 116"
Cohesion: 0.50
Nodes (3): Decimal, LegView, Shared quant input view: a leg projected to the values the math needs.  Decouple

## Knowledge Gaps
- **432 isolated node(s):** `@modelcontextprotocol/server-github`, `GITHUB_PERSONAL_ACCESS_TOKEN`, `GITHUB_TOKEN`, `@modelcontextprotocol/server-filesystem`, `@modelcontextprotocol/server-postgres` (+427 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **13 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `RedisBus` connect `Community 94` to `Community 98`, `Community 99`, `Community 100`, `Community 68`, `Community 102`, `Community 106`, `Community 76`, `Community 49`, `Community 50`, `Community 115`, `Community 52`, `Community 54`, `Community 87`, `Community 56`?**
  _High betweenness centrality (0.074) - this node is a cross-community bridge._
- **Why does `Tick` connect `Community 49` to `Community 101`, `Community 76`, `Community 50`, `Community 54`, `Community 56`, `Community 92`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._
- **Why does `StrategySpec` connect `Community 56` to `Community 61`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **Are the 76 inferred relationships involving `RedisBus` (e.g. with `Any` and `bool`) actually correct?**
  _`RedisBus` has 76 INFERRED edges - model-reasoned connections that need verification._
- **Are the 24 inferred relationships involving `DeltaRestClient` (e.g. with `CloseLegReq` and `CloseRequest`) actually correct?**
  _`DeltaRestClient` has 24 INFERRED edges - model-reasoned connections that need verification._
- **Are the 37 inferred relationships involving `PaperPosition` (e.g. with `CloseLegReq` and `CloseRequest`) actually correct?**
  _`PaperPosition` has 37 INFERRED edges - model-reasoned connections that need verification._
- **Are the 37 inferred relationships involving `PaperLeg` (e.g. with `CloseLegReq` and `CloseRequest`) actually correct?**
  _`PaperLeg` has 37 INFERRED edges - model-reasoned connections that need verification._