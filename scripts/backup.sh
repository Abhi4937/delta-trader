#!/usr/bin/env bash
# Nightly Postgres backup (ADR 0006 §4). Run via cron/systemd timer on the VM.
# Requires POSTGRES_URL (postgres://user:pass@host:5432/db). Keeps 14 days locally.
# Optional: upload to Oracle Object Storage with the OCI CLI (commented).
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/backups}"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$BACKUP_DIR/delta_trader_$TS.dump"

mkdir -p "$BACKUP_DIR"
pg_dump -Fc "$POSTGRES_URL" > "$OUT"
echo "wrote $OUT ($(du -h "$OUT" | cut -f1))"

# Optional OCI Object Storage upload (free tier):
# oci os object put --bucket-name delta-trader-backups --file "$OUT" --force

# Retention: drop dumps older than 14 days.
find "$BACKUP_DIR" -name 'delta_trader_*.dump' -mtime +14 -delete

# Optional Healthchecks.io ping so a missed backup alerts you:
[ -n "${BACKUP_HEALTHCHECK_URL:-}" ] && curl -fsS -m 10 "$BACKUP_HEALTHCHECK_URL" >/dev/null || true
