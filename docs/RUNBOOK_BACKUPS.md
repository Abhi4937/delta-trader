# Runbook — backups & restore (ADR 0006 §4)

Nightly `pg_dump` (custom format) of the Postgres data, 14-day local retention,
optional Oracle Object Storage upload.

## Schedule (on the Oracle VM)
`scripts/backup.sh` needs `POSTGRES_URL` and writes to `BACKUP_DIR` (default
`/backups`). Run it nightly with a cron entry or a systemd timer:

```cron
# /etc/cron.d/delta-trader-backup  — 03:17 UTC nightly
17 3 * * * root POSTGRES_URL='postgres://trader:trader_dev_pw@localhost:5432/delta_trader' BACKUP_DIR=/backups /opt/delta-trader/scripts/backup.sh >> /var/log/delta-trader/backup.log 2>&1
```

Run it against the running container's DB by pointing `POSTGRES_URL` at the host
port (the dev compose publishes 5432) or by `docker compose exec postgres pg_dump`.
Set `BACKUP_HEALTHCHECK_URL` to a Healthchecks.io check so a *missed* backup emails
you.

## Restore
```bash
# 1. Stop the backend so nothing writes during restore.
docker compose stop backend
# 2. Drop & recreate (or restore into a fresh DB), then load the dump:
pg_restore --clean --if-exists -d "$POSTGRES_URL" /backups/delta_trader_<TS>.dump
# 3. Re-apply any newer migrations and restart:
docker compose run --rm backend alembic upgrade head
docker compose start backend
```

## Verify a backup
```bash
pg_restore --list /backups/delta_trader_<TS>.dump | head   # should list tables
```

## What's backed up
All app tables (products, expiries, ticks_minute, strategies, paper_*, live_*).
Redis is a hot cache only (rebuilt from Delta + Postgres on boot) — not backed up.
