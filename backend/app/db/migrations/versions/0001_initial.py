"""initial schema: products, expiries, ticks_minute hypertable

Revision ID: 0001_initial
Revises:
Create Date: 2026-05-28
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0001_initial"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS timescaledb;")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS products (
          product_id     INTEGER PRIMARY KEY,
          symbol         TEXT UNIQUE NOT NULL,
          contract_type  TEXT NOT NULL,
          underlying     TEXT NOT NULL,
          strike         NUMERIC(20,8),
          expiry_code    TEXT,
          created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_products_symbol ON products (symbol);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_products_underlying ON products (underlying);")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS expiries (
          underlying  TEXT NOT NULL,
          expiry_code TEXT NOT NULL,
          expiry_ts   TIMESTAMPTZ NOT NULL,
          PRIMARY KEY (underlying, expiry_code)
        );
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS ticks_minute (
          ts          TIMESTAMPTZ NOT NULL,
          symbol      TEXT NOT NULL,
          open        NUMERIC(20,8),
          high        NUMERIC(20,8),
          low         NUMERIC(20,8),
          close       NUMERIC(20,8),
          mark_price  NUMERIC(20,8),
          iv          NUMERIC(10,6),
          delta       NUMERIC(10,6),
          gamma       NUMERIC(10,6),
          theta       NUMERIC(10,6),
          vega        NUMERIC(10,6),
          oi          NUMERIC(20,8),
          volume      NUMERIC(20,8),
          PRIMARY KEY (symbol, ts)
        );
        """
    )
    op.execute(
        "SELECT create_hypertable('ticks_minute', 'ts', "
        "chunk_time_interval => INTERVAL '1 day', if_not_exists => TRUE);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_ticks_minute_symbol_ts " "ON ticks_minute (symbol, ts DESC);"
    )
    op.execute(
        "SELECT add_retention_policy('ticks_minute', INTERVAL '90 days', " "if_not_exists => TRUE);"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS ticks_minute CASCADE;")
    op.execute("DROP TABLE IF EXISTS expiries CASCADE;")
    op.execute("DROP TABLE IF EXISTS products CASCADE;")
