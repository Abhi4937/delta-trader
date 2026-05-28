# Graph Report - delta-trader  (2026-05-29)

## Corpus Check
- 99 files · ~24,705 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 686 nodes · 1014 edges · 71 communities (59 shown, 12 thin omitted)
- Extraction: 82% EXTRACTED · 18% INFERRED · 0% AMBIGUOUS · INFERRED: 186 edges (avg confidence: 0.59)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `92c27aaa`
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

## God Nodes (most connected - your core abstractions)
1. `RedisBus` - 42 edges
2. `MinuteBuffer` - 34 edges
3. `Tick` - 30 edges
4. `DeltaRestClient` - 23 edges
5. `DeltaWSClient` - 16 edges
6. `MinuteAccumulator` - 16 edges
7. `compilerOptions` - 16 edges
8. `MinuteAggregator` - 14 edges
9. `lifespan()` - 13 edges
10. `TickNormalizer` - 13 edges

## Surprising Connections (you probably didn't know these)
- `lifespan()` --calls--> `dispose_engine()`  [INFERRED]
  backend/app/main.py → backend/app/db/session.py
- `object` --uses--> `Tick`  [INFERRED]
  backend/app/workers/minute_buffer.py → backend/app/models/market.py
- `lifespan()` --calls--> `bootstrap_products()`  [INFERRED]
  backend/app/main.py → backend/app/services/bootstrap.py
- `lifespan()` --calls--> `DeltaWSClient`  [INFERRED]
  backend/app/main.py → backend/app/services/delta_ws.py
- `lifespan()` --calls--> `close_bus()`  [INFERRED]
  backend/app/main.py → backend/app/services/redis_bus.py

## Communities (71 total, 12 thin omitted)

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
Cohesion: 0.06
Nodes (51): ExpirySelectorProps, ChainRow, ChainRowProps, findAtmIndex(), fmtIvPct(), groupByStrike(), OptionChainTableProps, SideCells (+43 more)

### Community 13 - "Community 13"
Cohesion: 0.18
Nodes (10): 2026-05-28 19:36:18 UTC — Autonomous build starting, 2026-05-28 19:37:00 UTC — Pre-flight verification (Block A, Step 0), 2026-05-28 19:40:00 UTC — Phase 0, Step 2 — Create repo + clone, 2026-05-28 19:52:00 UTC — Phase 0, Steps 10-14 + merge, 2026-05-28 20:05:00 UTC — Phase 0, Steps 3-9, 2026-05-28 20:05:00 UTC — Phase 1, Step 1 — ADR, 2026-05-28 20:45:00 UTC — Phase 1, Steps 4-5 — Frontend + full e2e, 2026-05-28 20:55:00 UTC — Phase 1, Steps 2-3 — Infra + backend (+2 more)

### Community 14 - "Community 14"
Cohesion: 0.40
Nodes (4): code:bash (claude mcp list   # should list all 8; approve project serve), MCP Servers, Secrets, Verify

### Community 15 - "Community 15"
Cohesion: 0.40
Nodes (4): Alternatives considered, Problem / motivation, Proposed solution, Scope

### Community 18 - "Community 18"
Cohesion: 0.08
Nodes (23): health(), health_deep(), Health endpoints: ``/health`` (process liveness) and ``/health/deep`` (db + redi, DecimalJSONResponse, _default(), Custom JSON response that serializes Decimal as string (money safety).  FastAPI', health(), lifespan() (+15 more)

### Community 24 - "Community 24"
Cohesion: 0.22
Nodes (8): Delta Exchange Integration, Endpoints (verified), `mark_vol` scaling differs by transport, Phase 1 scope, Product id field, Product / ticker shapes, Symbol format, Verified quirks (Phase 1)

### Community 35 - "Community 35"
Cohesion: 0.20
Nodes (5): Any, bool, str, FakeBus, In-memory stand-in for RedisBus capturing latest hashes, pubs, and sets.

### Community 49 - "Community 49"
Cohesion: 0.10
Nodes (30): Any, bool, datetime, RedisBus, str, Base, SQLAlchemy declarative base shared by all ORM models., Project-wide declarative base. (+22 more)

### Community 50 - "Community 50"
Cohesion: 0.07
Nodes (42): str, int, bytes, str, Any, bytes, datetime, Decimal (+34 more)

### Community 51 - "Community 51"
Cohesion: 0.09
Nodes (19): Any, bool, float, int, object, str, Delta REST client tests with respx-mocked HTTP (recorded-shape fixtures)., The query httpx sends must be alphabetically sorted (== the signed string). (+11 more)

### Community 52 - "Community 52"
Cohesion: 0.08
Nodes (22): bytes, float, int, RedisBus, str, bool, str, MinuteBuffer (+14 more)

### Community 53 - "Community 53"
Cohesion: 0.06
Nodes (31): dependencies, clsx, date-fns, decimal.js, @hookform/resolvers, lightweight-charts, lucide-react, react (+23 more)

### Community 54 - "Community 54"
Cohesion: 0.16
Nodes (11): datetime, float, MinuteBuffer, str, object, Tick, _asyncpg_dsn(), Minute aggregator: drains closed minute buckets from the shared buffer and upser (+3 more)

### Community 55 - "Community 55"
Cohesion: 0.09
Nodes (21): 0002 — Phase 1 foundation layer, 10. Trade-offs considered and rejected, 11. Test strategy, 1. Component diagram, 2. WS connection topology — single shared connection (multiplexed), 3. Tick normalization model, 4. Redis key schema, 5. Postgres schema (Alembic migration runs this raw SQL) (+13 more)

### Community 56 - "Community 56"
Cohesion: 0.17
Nodes (18): list_expiries(), list_products(), option_chain(), Read-only market metadata + option-chain endpoints., Live option chain. Prefers Redis snapshots; falls back to Delta REST., _row_from_delta(), _row_from_redis(), async_sessionmaker (+10 more)

### Community 57 - "Community 57"
Cohesion: 0.19
Nodes (9): str, BaseSettings, get_settings(), Application configuration via pydantic-settings.  Reads from the environment (an, asyncpg DSN used by the application., Synchronous DSN used by Alembic migrations., Cached settings singleton., Settings (+1 more)

### Community 58 - "Community 58"
Cohesion: 0.11
Nodes (18): devDependencies, autoprefixer, eslint, eslint-plugin-react-hooks, jsdom, @playwright/test, postcss, tailwindcss (+10 more)

### Community 59 - "Community 59"
Cohesion: 0.21
Nodes (11): datetime, datetime, Unit + property tests for the minute aggregation buffer., test_buffer_builds_ohlc(), test_minute_floor_truncates_seconds(), test_ohlc_invariants(), _tick(), minute_floor() (+3 more)

### Community 60 - "Community 60"
Cohesion: 0.31
Nodes (8): Any, bytes, str, _default(), dumps(), loads(), JSON helpers that serialize ``Decimal`` as strings (never float).  Money safety, Serialize to a JSON string, emitting Decimal as string.

### Community 61 - "Community 61"
Cohesion: 0.36
Nodes (9): _encode(), _handle_control(), _push_loop(), Frontend-facing WebSocket hub at ``/ws``.  Accepts subscribe/unsubscribe control, Subscription, ws_endpoint(), Any, str (+1 more)

### Community 63 - "Community 63"
Cohesion: 0.50
Nodes (3): expirySelect, ivCells, rows

### Community 67 - "Community 67"
Cohesion: 0.20
Nodes (4): object, FakeAsyncpgConn, Shared test fixtures and in-memory fakes (no external services required)., Records copy + execute calls instead of touching Postgres.

### Community 68 - "Community 68"
Cohesion: 0.31
Nodes (8): MonkeyPatch, Worker logic tests using in-memory fakes (no Redis/Postgres)., test_aggregator_flush_upserts(), test_aggregator_no_rows_is_noop(), test_aggregator_rebuffers_on_db_failure(), test_normalizer_process_updates_redis_and_buffer(), test_spot_indexer_routes_channels(), MinuteAggregator

### Community 69 - "Community 69"
Cohesion: 0.29
Nodes (4): int, Connection, MinuteAccumulator, Drain closed buckets and upsert them. Returns rows written.          On any DB f

## Knowledge Gaps
- **212 isolated node(s):** `@modelcontextprotocol/server-github`, `GITHUB_PERSONAL_ACCESS_TOKEN`, `GITHUB_TOKEN`, `@modelcontextprotocol/server-filesystem`, `@modelcontextprotocol/server-postgres` (+207 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **12 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `RedisBus` connect `Community 52` to `Community 49`, `Community 50`?**
  _High betweenness centrality (0.056) - this node is a cross-community bridge._
- **Why does `Tick` connect `Community 50` to `Community 49`, `Community 59`, `Community 68`, `Community 54`?**
  _High betweenness centrality (0.054) - this node is a cross-community bridge._
- **Why does `DeltaRestClient` connect `Community 51` to `Community 56`, `Community 49`?**
  _High betweenness centrality (0.046) - this node is a cross-community bridge._
- **Are the 29 inferred relationships involving `RedisBus` (e.g. with `Any` and `bool`) actually correct?**
  _`RedisBus` has 29 INFERRED edges - model-reasoned connections that need verification._
- **Are the 29 inferred relationships involving `MinuteBuffer` (e.g. with `bool` and `datetime`) actually correct?**
  _`MinuteBuffer` has 29 INFERRED edges - model-reasoned connections that need verification._
- **Are the 26 inferred relationships involving `Tick` (e.g. with `Any` and `bool`) actually correct?**
  _`Tick` has 26 INFERRED edges - model-reasoned connections that need verification._
- **Are the 9 inferred relationships involving `DeltaRestClient` (e.g. with `Any` and `str`) actually correct?**
  _`DeltaRestClient` has 9 INFERRED edges - model-reasoned connections that need verification._