# Security

## Reporting
This is a personal single-user project. Report issues privately to the repo owner
(GitHub profile email) — please don't open a public issue for anything exploitable.

## Threat model
- **Single user, internet-exposed, API-key holder.** The operator runs one instance
  on their own VM and holds their own Delta API keys. There is no multi-tenancy.
- **Primary asset**: the Delta API keys and the ability to place/cancel real orders.
- **Primary threats**: (a) someone who finds the URL poking the API; (b) key leakage
  via logs/errors; (c) an unintended live order.

## Controls
- **No live orders by default.** Every order-placing path is double-gated:
  `LIVE_TRADING_ENABLED=true` **and** a per-request `confirm=true`. Default ships
  read-only. The intent is logged at INFO (no keys) before any order is sent.
- **Keys never logged/serialized.** Verified: no `logger.*` call references
  `delta_api_key`/`delta_api_secret`/`signature`; keys are not in URLs, responses,
  or error messages. (Grep gate in CI-friendly form: `grep -rn logger app/ | grep -i api_key` → empty.)
- **Platform bearer token.** Set `API_BEARER_TOKEN` in prod → all routes except
  `/health*` and `/metrics` require `Authorization: Bearer <token>` (WS via `?token=`).
  Unset in dev/CI (permissive) so local UX/tests are unchanged.
- **Rate limiting.** Per-IP 60/min/route (slowapi) → 429 with `Retry-After`. A shared
  ~10 req/s token bucket throttles all authenticated Delta calls. Note: slowapi keys
  on `request.client.host` (not `X-Forwarded-For`), so behind Caddy the limit is
  effectively global-per-route — fine for a single-user deployment.
- **CORS** locked to `CORS_ORIGINS` (the deployed origin in prod; localhost in dev).
- **Network** (ADR 0006): only 80/443 inbound; Postgres/Redis never published; SSH on
  a non-default port.

## Dependency audit (v1.0.0)
`pip-audit` + `pnpm audit` run on release. Frontend: **no known vulns**. Backend:
- **Fixed**: `orjson` → 3.11.5, `python-dotenv` → 1.2.2.
- **Assessed / accepted for v1** (with follow-up to bump in a maintenance pass):
  - `starlette` 0.38.6 multipart-DoS CVEs (CVE-2024-47874 / CVE-2025-54121 /
    PYSEC-2026-161): **not applicable** — the app exposes **no multipart/file-upload
    endpoints**, and the API is bearer-gated + rate-limited. Fully patching requires a
    major FastAPI bump deferred to avoid destabilizing the release.
  - `pyarrow` 17.0.0 (PYSEC-2026-113): the Parquet archival path is **not
    internet-exposed** and not enabled in the default config.

## Out of scope (v1)
Multi-user auth/RBAC, secrets manager integration (keys live in `.env`), WAF, and
audit-grade tamper-evident logging.
