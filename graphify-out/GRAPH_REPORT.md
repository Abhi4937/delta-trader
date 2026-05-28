# Graph Report - delta-trader  (2026-05-29)

## Corpus Check
- 138 files · ~47,315 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1266 nodes · 2331 edges · 98 communities (86 shown, 12 thin omitted)
- Extraction: 76% EXTRACTED · 24% INFERRED · 0% AMBIGUOUS · INFERRED: 569 edges (avg confidence: 0.57)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `ee57bd99`
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

## God Nodes (most connected - your core abstractions)
1. `RedisBus` - 61 edges
2. `PaperPosition` - 39 edges
3. `PaperLeg` - 39 edges
4. `DeltaRestClient` - 36 edges
5. `StrategySpec` - 36 edges
6. `MinuteBuffer` - 34 edges
7. `Tick` - 31 edges
8. `PaperEngine` - 31 edges
9. `InsufficientDepthError` - 29 edges
10. `OrderBook` - 27 edges

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

## Communities (98 total, 12 thin omitted)

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
Cohesion: 0.15
Nodes (22): UseOptionChainResult, OptionRow, CandleFrame, ChainState, desiredSubs, ensureSocket(), ErrorFrame, hasWindow() (+14 more)

### Community 13 - "Community 13"
Cohesion: 0.15
Nodes (12): 2026-05-28 19:36:18 UTC — Autonomous build starting, 2026-05-28 19:37:00 UTC — Pre-flight verification (Block A, Step 0), 2026-05-28 19:40:00 UTC — Phase 0, Step 2 — Create repo + clone, 2026-05-28 19:52:00 UTC — Phase 0, Steps 10-14 + merge, 2026-05-28 20:05:00 UTC — Phase 0, Steps 3-9, 2026-05-28 20:05:00 UTC — Phase 1, Step 1 — ADR, 2026-05-28 20:45:00 UTC — Phase 1, Steps 4-5 — Frontend + full e2e, 2026-05-28 20:55:00 UTC — Phase 1, Steps 2-3 — Infra + backend (+4 more)

### Community 14 - "Community 14"
Cohesion: 0.40
Nodes (4): code:bash (claude mcp list   # should list all 8; approve project serve), MCP Servers, Secrets, Verify

### Community 15 - "Community 15"
Cohesion: 0.40
Nodes (4): Alternatives considered, Problem / motivation, Proposed solution, Scope

### Community 18 - "Community 18"
Cohesion: 0.10
Nodes (32): health(), health_deep(), Health endpoints: ``/health`` (process liveness) and ``/health/deep`` (db + redi, list_expiries(), list_products(), option_chain(), Read-only market metadata + option-chain endpoints., Live option chain. Prefers Redis snapshots; falls back to Delta REST. (+24 more)

### Community 23 - "Community 23"
Cohesion: 0.17
Nodes (11): Architecture, code:block1 (Delta India (public)                  Backend (single asynci), code:block2 (POST /paper/strategies(/execute)            POST /paper/posi), code:block3 (notional    = vwap * qty * contract_size), Data stores, Execution + slippage (`quant/slippage.py`, `paper/executor.py`), Failure modes, Foundation (Phase 1) — realtime data spine (+3 more)

### Community 24 - "Community 24"
Cohesion: 0.22
Nodes (8): Delta Exchange Integration, Endpoints (verified), `mark_vol` scaling differs by transport, Phase 1 scope, Product id field, Product / ticker shapes, Symbol format, Verified quirks (Phase 1)

### Community 35 - "Community 35"
Cohesion: 0.09
Nodes (15): Any, bool, object, str, MonkeyPatch, FakeAsyncpgConn, FakeBus, Shared test fixtures and in-memory fakes (no external services required). (+7 more)

### Community 49 - "Community 49"
Cohesion: 0.07
Nodes (41): Any, bool, datetime, DeltaRestClient, RedisBus, str, Any, bool (+33 more)

### Community 50 - "Community 50"
Cohesion: 0.18
Nodes (23): Any, datetime, Decimal, str, Tick, Decimal, Unit tests for tick normalization (Delta gotchas + Decimal safety)., test_dec_parses_and_tolerates_garbage() (+15 more)

### Community 51 - "Community 51"
Cohesion: 0.22
Nodes (4): Delta REST client tests with respx-mocked HTTP (recorded-shape fixtures)., The query httpx sends must be alphabetically sorted (== the signed string)., test_sent_query_is_sorted_to_match_signature(), test_signature_is_deterministic_hmac()

### Community 52 - "Community 52"
Cohesion: 0.06
Nodes (32): health(), lifespan(), FastAPI application entrypoint.  The lifespan handler runs the public-data boots, AsyncEngine, AsyncSession, bytes, float, int (+24 more)

### Community 53 - "Community 53"
Cohesion: 0.12
Nodes (16): dependencies, clsx, date-fns, decimal.js, @hookform/resolvers, lightweight-charts, lucide-react, react (+8 more)

### Community 54 - "Community 54"
Cohesion: 0.12
Nodes (16): datetime, float, int, MinuteBuffer, str, object, Tick, Connection (+8 more)

### Community 55 - "Community 55"
Cohesion: 0.09
Nodes (21): 0002 — Phase 1 foundation layer, 10. Trade-offs considered and rejected, 11. Test strategy, 1. Component diagram, 2. WS connection topology — single shared connection (multiplexed), 3. Tick normalization model, 4. Redis key schema, 5. Postgres schema (Alembic migration runs this raw SQL) (+13 more)

### Community 56 - "Community 56"
Cohesion: 0.06
Nodes (80): close_position(), CloseLegReq, CloseRequest, create_or_preview(), _exec_result_payload(), execute_strategy(), ExecuteRequest, get_engine() (+72 more)

### Community 57 - "Community 57"
Cohesion: 0.15
Nodes (12): str, BaseSettings, get_settings(), Application configuration via pydantic-settings.  Reads from the environment (an, asyncpg DSN used by the application., asyncpg DSN used by the application., Synchronous DSN used by Alembic migrations., Synchronous DSN used by Alembic migrations. (+4 more)

### Community 58 - "Community 58"
Cohesion: 0.11
Nodes (18): devDependencies, autoprefixer, eslint, eslint-plugin-react-hooks, jsdom, @playwright/test, postcss, tailwindcss (+10 more)

### Community 59 - "Community 59"
Cohesion: 0.33
Nodes (8): datetime, int, str, Unit + property tests for the minute aggregation buffer., test_buffer_builds_ohlc(), test_minute_floor_truncates_seconds(), test_ohlc_invariants(), _tick()

### Community 60 - "Community 60"
Cohesion: 0.31
Nodes (8): Any, bytes, str, _default(), dumps(), loads(), JSON helpers that serialize ``Decimal`` as strings (never float).  Money safety, Serialize to a JSON string, emitting Decimal as string.

### Community 61 - "Community 61"
Cohesion: 0.05
Nodes (75): Decimal, OrderBook, str, Decimal, ExecutionResult, int, OrderBook, str (+67 more)

### Community 63 - "Community 63"
Cohesion: 0.50
Nodes (3): expirySelect, ivCells, rows

### Community 67 - "Community 67"
Cohesion: 0.06
Nodes (49): Decimal, LegView, str, bool, Decimal, float, int, LegView (+41 more)

### Community 68 - "Community 68"
Cohesion: 0.18
Nodes (9): int, bytes, MinuteBuffer, RedisBus, str, test_spot_indexer_routes_channels(), MinuteBuffer, Spot/candle indexer: same pattern as the tick normalizer but for the BTC spot in (+1 more)

### Community 69 - "Community 69"
Cohesion: 0.09
Nodes (45): content, description, content, description, schema, application/json, get, description (+37 more)

### Community 70 - "Community 70"
Cohesion: 0.10
Nodes (24): CloseLeg, closePosition(), CloseResult, ErrorDetail, executeStrategy(), getJSON(), getPositionMtm(), InsufficientDepthError (+16 more)

### Community 71 - "Community 71"
Cohesion: 0.11
Nodes (19): ChainRow, ChainRowProps, findAtmIndex(), fmtIvPct(), OptionChainTableProps, SideCells, SideCellsProps, signClass() (+11 more)

### Community 72 - "Community 72"
Cohesion: 0.07
Nodes (28): 0003 — Phase 2 paper-trade engine, 10. API surface (`api/paper.py`), 11. Failure modes, 1. Data model, 2. Entry execution — orderbook walk + linear impact, 3. MTM cadence — per-second Redis, per-minute Timescale, 4. Strategy Greeks aggregation, 5. Strategy IV — notional-weighted average of per-leg mark IVs (+20 more)

### Community 73 - "Community 73"
Cohesion: 0.12
Nodes (25): breakevens(), estimatedSlippageCost(), legPayoff(), maxProfitLoss, netEntryCredit(), netGreeks, OptionLeg, optionLegs() (+17 more)

### Community 74 - "Community 74"
Cohesion: 0.12
Nodes (18): groupByStrike(), useOptionChain(), LegSpec, PreviewLeg, OptionSide, ParsedSymbol, parseSymbol(), ClosePositionDialog() (+10 more)

### Community 75 - "Community 75"
Cohesion: 0.16
Nodes (11): ExpirySelectorProps, ExpiriesResponse, Expiry, getExpiries(), getJSON(), getOptionChain(), OptionChainResponse, chainRows (+3 more)

### Community 76 - "Community 76"
Cohesion: 0.16
Nodes (10): str, bytes, MinuteBuffer, RedisBus, Normalized in-memory market-data shapes (the hot path).  Distinct from the ORM m, A normalized market update for one symbol at one instant., Flatten to a string->string hash for ``HSET latest:{symbol}``.          Decimals, Tick (+2 more)

### Community 77 - "Community 77"
Cohesion: 0.12
Nodes (16): anyOf, items, title, type, title, type, loc, msg (+8 more)

### Community 78 - "Community 78"
Cohesion: 0.13
Nodes (14): addLeg, closeBtn, expirySelect, legRows, midIndex, mtmCell, netDeltaFooter, netThetaFooter (+6 more)

### Community 79 - "Community 79"
Cohesion: 0.16
Nodes (11): PaperPosition, ClosePositionDialogProps, PaperPositionDetailProps, PaperPositionsTableProps, PositionRow, RowProps, closeBtn, onClose (+3 more)

### Community 80 - "Community 80"
Cohesion: 0.18
Nodes (11): Base, SQLAlchemy declarative base shared by all ORM models., Project-wide declarative base., DeclarativeBase, PaperFill, PaperLeg, PaperPosition, ORM models for the paper-trade engine (ADR 0003 §1, §9).  Postgres ENUM columns (+3 more)

### Community 81 - "Community 81"
Cohesion: 0.17
Nodes (11): Choices I made autonomously (from the defaults table + judgment calls), code:powershell (cd C:\dev\Live_Trading_platform\build\delta-trader), Issues for human review (reviewer NITs — deliberately not changed overnight), Morning Report — Delta Trader, Numbers, Recommended next steps in this order, Skipped / Deferred, Status (+3 more)

### Community 82 - "Community 82"
Cohesion: 0.17
Nodes (12): properties, required, title, type, side, symbol, LegSpec, enum (+4 more)

### Community 83 - "Community 83"
Cohesion: 0.29
Nodes (8): useExpiries(), usePaperPositions(), useSpotCandles(), useChainStore, Section1Paper(), Tab, TabButtonProps, PaperTradePage()

### Community 84 - "Community 84"
Cohesion: 0.18
Nodes (11): default, title, type, title, type, anyOf, title, atomic (+3 more)

### Community 85 - "Community 85"
Cohesion: 0.18
Nodes (11): properties, required, title, type, title, type, leg_id, qty (+3 more)

### Community 86 - "Community 86"
Cohesion: 0.18
Nodes (10): components, schemas, info, title, version, openapi, StrategySpec, required (+2 more)

### Community 87 - "Community 87"
Cohesion: 0.27
Nodes (8): usePaperMtm(), Mtm, onPaperFrame(), PaperPositionFrame, unsubscribePaperPosition(), ensureWired(), PaperStoreState, usePaperStore

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
Cohesion: 0.50
Nodes (4): underlying, default, title, type

## Knowledge Gaps
- **366 isolated node(s):** `@modelcontextprotocol/server-github`, `GITHUB_PERSONAL_ACCESS_TOKEN`, `GITHUB_TOKEN`, `@modelcontextprotocol/server-filesystem`, `@modelcontextprotocol/server-postgres` (+361 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **12 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `RedisBus` connect `Community 56` to `Community 68`, `Community 76`, `Community 49`, `Community 50`, `Community 52`?**
  _High betweenness centrality (0.060) - this node is a cross-community bridge._
- **Why does `DeltaRestClient` connect `Community 49` to `Community 56`, `Community 18`?**
  _High betweenness centrality (0.035) - this node is a cross-community bridge._
- **Why does `Tick` connect `Community 76` to `Community 35`, `Community 68`, `Community 49`, `Community 50`, `Community 54`, `Community 56`, `Community 59`, `Community 92`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **Are the 48 inferred relationships involving `RedisBus` (e.g. with `Any` and `bool`) actually correct?**
  _`RedisBus` has 48 INFERRED edges - model-reasoned connections that need verification._
- **Are the 37 inferred relationships involving `PaperPosition` (e.g. with `CloseLegReq` and `CloseRequest`) actually correct?**
  _`PaperPosition` has 37 INFERRED edges - model-reasoned connections that need verification._
- **Are the 37 inferred relationships involving `PaperLeg` (e.g. with `CloseLegReq` and `CloseRequest`) actually correct?**
  _`PaperLeg` has 37 INFERRED edges - model-reasoned connections that need verification._
- **Are the 22 inferred relationships involving `DeltaRestClient` (e.g. with `CloseLegReq` and `CloseRequest`) actually correct?**
  _`DeltaRestClient` has 22 INFERRED edges - model-reasoned connections that need verification._