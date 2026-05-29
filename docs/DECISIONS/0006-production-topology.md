# 0006 — Production topology

- **Status**: Accepted
- **Date**: 2026-05-28
- **Deciders**: Project owner, deployment engineer

## Context
Deploy the (single-user) platform to **Oracle Cloud Always Free** (2× ARM Ampere
A1, up to 4 vCPU / 24 GB / 200 GB, no time limit, $0). TLS, basic observability,
nightly backups, and a simple security gate are in scope.

## Decision

### Topology — single VM, Docker Compose
One `A1.Flex` Ubuntu VM running the existing compose stack plus a Caddy reverse
proxy. **Rejected**: split/multi-VM or k8s — overkill for one user and one venue;
a single 24 GB box runs postgres+redis+backend+frontend+caddy with headroom.

```
internet ──443──▶ Caddy ──/api,/ws──▶ backend:8000 ──▶ postgres:5432 / redis:6379 (internal)
                   └──────────────────▶ frontend:80 (static, nginx)        backend ──▶ Delta (outbound)
```

### Network (Oracle VCN)
- Ingress: **80, 443 only**; SSH on a **non-default port**. Everything else closed.
- Postgres/Redis are **never** published — only reachable on the compose network.
- Outbound to Delta (`api.india.delta.exchange`, `socket.india.delta.exchange`) unrestricted.

### Process layout / restart
- `restart: unless-stopped` on every service (prod overlay).
- A **systemd unit** (`infra/systemd/delta-trader.service`) brings the compose
  stack up at boot and restarts it on failure.
- Resource reservations+limits per service (prod overlay): backend 6G, frontend
  512M, postgres 8G, redis 1G — leaves headroom on a 24 GB box.

### Persistence
- Postgres data on a **named Docker volume backed by a separate Oracle block
  volume**, so the boot disk can be reimaged without losing data.
- Nightly `pg_dump` (`scripts/backup.sh`) to `/backups` (14-day local retention);
  optional OCI Object Storage upload (free tier) documented but not required for v1.

### TLS
- Caddy auto-provisions Let's Encrypt for a real domain. With no domain, Caddy's
  internal CA (local TLS) or plain HTTP behind the firewall — flagged in
  `docs/DEPLOY_ORACLE.md`.

### Security gate
- Optional **bearer token** on `/api/*` + `/ws` (env `API_BEARER_TOKEN`): enforced
  when set (prod), permissive when unset (dev/CI) so existing tests/UX are unchanged.
- Per-IP **rate limiting** (slowapi), CORS locked to the deployed origin in prod.
- Delta keys never logged; order paths keep the `live_trading_enabled` guard.

### Updates
`git pull` + `docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml up -d --build`
then `alembic upgrade head` (run in the backend container). Documented in the runbook.

## Consequences
- $0/month infra (Oracle Always Free) + optional domain cost.
- One box to operate; compose + systemd is the whole control plane.
- Observability (Prometheus/Grafana) is an **optional** overlay so the base box
  stays light.

## Trade-offs rejected
- **k8s / multi-VM** — operational weight with no benefit at this scale.
- **Managed Postgres** — costs money; the block-volume-backed container + nightly
  dump is sufficient for one user.
- **Publishing DB ports** — never; internal-only.
