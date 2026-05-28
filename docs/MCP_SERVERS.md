# MCP Servers

Eight MCP servers are configured for this project in `.mcp.json` (project scope, committed).

> **First-time approval required.** Project-scoped MCP servers are gated behind a one-time
> trust prompt. Run `claude` interactively once in this repo and approve them, or set
> `enableAllProjectMcpServers: true` in `.claude/settings.local.json`. Until approved they
> show `⏸ Pending approval` in `claude mcp list`. This cannot be done non-interactively.

| Server | Package | Used for | Env vars needed |
|---|---|---|---|
| `github` | `@modelcontextprotocol/server-github` | Issues, PRs, code search across the repo | `GITHUB_TOKEN` / `GITHUB_PERSONAL_ACCESS_TOKEN` (fine-grained PAT scoped to this repo) |
| `filesystem` | `@modelcontextprotocol/server-filesystem` | Sandboxed read/write inside the repo root | — |
| `postgres` | `@modelcontextprotocol/server-postgres` | Query the live dev DB during development | DSN baked into args; DB must be up |
| `memory` | `@modelcontextprotocol/server-memory` | Persistent notes across sessions | writes `./.claude/memory.json` (gitignored) |
| `sequential-thinking` | `@modelcontextprotocol/server-sequential-thinking` | Structured reasoning for hard problems | — |
| `playwright` | `@playwright/mcp` | E2E test authoring + UI debugging / screenshots | — |
| `context7` | `@upstash/context7-mcp` | Up-to-date library docs (FastAPI, React, Recharts…) | optional `CONTEXT7_API_KEY` for higher limits |
| `fetch` | `@modelcontextprotocol/server-fetch` | Fetch Delta docs pages, RFCs, etc. | — (this is a Python/uvx server; if the npm form fails, use `uvx mcp-server-fetch`) |

## Secrets
The `github` server reads its token from the `GITHUB_TOKEN` / `GITHUB_PERSONAL_ACCESS_TOKEN`
environment variables via `${VAR}` expansion in `.mcp.json` — **no token is committed**.
Set these in your shell environment or in `.claude/settings.local.json` (gitignored).

## Verify
```bash
claude mcp list   # should list all 8; approve project servers on first run
```
