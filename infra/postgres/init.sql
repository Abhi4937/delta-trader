-- Postgres init: enable TimescaleDB and ensure the trader role exists.
-- Tables/hypertables are created via Alembic migrations (Phase 1).
CREATE EXTENSION IF NOT EXISTS timescaledb;

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'trader') THEN
    CREATE ROLE trader LOGIN PASSWORD 'trader_dev_pw';
  END IF;
END
$$;
