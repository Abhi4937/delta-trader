# Graph Report - delta-trader  (2026-05-29)

## Corpus Check
- 50 files · ~5,460 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 188 nodes · 147 edges · 49 communities (39 shown, 10 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `5adf46b3`
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

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 16 edges
2. `Delta Exchange India — API reference` - 10 edges
3. `npx` - 8 edges
4. `Delta Trader — Project Brief for Claude` - 8 edges
5. `Options math reference` - 8 edges
6. `React trading UI patterns` - 7 edges
7. `Delta Trader` - 6 edges
8. `TimescaleDB conventions for this repo` - 6 edges
9. `github` - 5 edges
10. `0001 — Stack choice` - 5 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Communities (49 total, 10 thin omitted)

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
Cohesion: 0.40
Nodes (4): //, permissions, allow, deny

### Community 13 - "Community 13"
Cohesion: 0.40
Nodes (4): 2026-05-28 19:36:18 UTC — Autonomous build starting, 2026-05-28 19:37:00 UTC — Pre-flight verification (Block A, Step 0), 2026-05-28 19:40:00 UTC — Phase 0, Step 2 — Create repo + clone, 2026-05-28 20:05:00 UTC — Phase 0, Steps 3-9

### Community 14 - "Community 14"
Cohesion: 0.40
Nodes (4): code:bash (claude mcp list   # should list all 8; approve project serve), MCP Servers, Secrets, Verify

### Community 15 - "Community 15"
Cohesion: 0.40
Nodes (4): Alternatives considered, Problem / motivation, Proposed solution, Scope

## Knowledge Gaps
- **103 isolated node(s):** `@modelcontextprotocol/server-github`, `GITHUB_PERSONAL_ACCESS_TOKEN`, `GITHUB_TOKEN`, `@modelcontextprotocol/server-filesystem`, `@modelcontextprotocol/server-postgres` (+98 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **10 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What connects `@modelcontextprotocol/server-github`, `GITHUB_PERSONAL_ACCESS_TOKEN`, `GITHUB_TOKEN` to the rest of the system?**
  _104 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.1368421052631579 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.1111111111111111 - nodes in this community are weakly interconnected._