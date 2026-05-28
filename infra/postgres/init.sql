-- Postgres init: enable TimescaleDB. Tables/hypertables created via Alembic in Phase 1.
CREATE EXTENSION IF NOT EXISTS timescaledb;
