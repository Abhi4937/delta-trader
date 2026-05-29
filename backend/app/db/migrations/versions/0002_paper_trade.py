"""paper-trade engine: contract_size on products + paper_* tables

Revision ID: 0002_paper_trade
Revises: 0001_initial
Create Date: 2026-05-28
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0002_paper_trade"
down_revision: str | None = "0001_initial"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TABLE products ADD COLUMN IF NOT EXISTS contract_size NUMERIC(20,8);")

    op.execute("CREATE TYPE position_status AS ENUM ('open','partially_closed','closed');")
    op.execute("CREATE TYPE leg_status AS ENUM ('open','partially_closed','closed');")
    op.execute("CREATE TYPE leg_side AS ENUM ('buy','sell');")
    op.execute("CREATE TYPE fill_kind AS ENUM ('entry','close');")

    op.execute(
        """
        CREATE TABLE strategies (
          id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          name        TEXT NOT NULL,
          underlying  TEXT NOT NULL DEFAULT 'BTC',
          spec        JSONB NOT NULL,
          created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        """
    )

    op.execute(
        """
        CREATE TABLE paper_positions (
          id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          strategy_id     BIGINT NOT NULL REFERENCES strategies(id),
          underlying      TEXT NOT NULL DEFAULT 'BTC',
          status          position_status NOT NULL DEFAULT 'open',
          opened_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
          closed_at       TIMESTAMPTZ,
          entry_cost      NUMERIC(20,8) NOT NULL,
          realized_pnl    NUMERIC(20,8) NOT NULL DEFAULT 0,
          margin_estimate NUMERIC(20,8) NOT NULL DEFAULT 0,
          flags           JSONB NOT NULL DEFAULT '{}'::jsonb
        );
        """
    )
    op.execute("CREATE INDEX ix_paper_positions_status ON paper_positions (status);")

    op.execute(
        """
        CREATE TABLE paper_legs (
          id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          position_id   BIGINT NOT NULL REFERENCES paper_positions(id) ON DELETE CASCADE,
          symbol        TEXT NOT NULL,
          product_id    INTEGER REFERENCES products(product_id),
          side          leg_side NOT NULL,
          qty           NUMERIC(20,8) NOT NULL,
          qty_open      NUMERIC(20,8) NOT NULL,
          contract_size NUMERIC(20,8) NOT NULL,
          entry_fill    NUMERIC(20,8) NOT NULL,
          exit_fill     NUMERIC(20,8),
          status        leg_status NOT NULL DEFAULT 'open'
        );
        """
    )
    op.execute("CREATE INDEX ix_paper_legs_position ON paper_legs (position_id);")

    op.execute(
        """
        CREATE TABLE paper_fills (
          id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          leg_id        BIGINT NOT NULL REFERENCES paper_legs(id) ON DELETE CASCADE,
          kind          fill_kind NOT NULL,
          side          leg_side NOT NULL,
          qty           NUMERIC(20,8) NOT NULL,
          vwap          NUMERIC(20,8) NOT NULL,
          impact        NUMERIC(20,8) NOT NULL,
          fill_price    NUMERIC(20,8) NOT NULL,
          book_snapshot JSONB NOT NULL,
          ts            TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        """
    )
    op.execute("CREATE INDEX ix_paper_fills_leg ON paper_fills (leg_id);")

    op.execute(
        """
        CREATE TABLE paper_mtm_minute (
          position_id    BIGINT NOT NULL REFERENCES paper_positions(id) ON DELETE CASCADE,
          ts             TIMESTAMPTZ NOT NULL,
          open           NUMERIC(20,8),
          high           NUMERIC(20,8),
          low            NUMERIC(20,8),
          close          NUMERIC(20,8),
          unrealized_pnl NUMERIC(20,8),
          realized_pnl   NUMERIC(20,8),
          net_delta      NUMERIC(20,8),
          net_gamma      NUMERIC(20,8),
          net_theta      NUMERIC(20,8),
          net_vega       NUMERIC(20,8),
          strategy_iv    NUMERIC(10,6),
          mark_stale     BOOLEAN NOT NULL DEFAULT FALSE,
          PRIMARY KEY (position_id, ts)
        );
        """
    )
    op.execute(
        "SELECT create_hypertable('paper_mtm_minute', 'ts', "
        "chunk_time_interval => INTERVAL '1 day', if_not_exists => TRUE);"
    )
    op.execute(
        "CREATE INDEX ix_paper_mtm_minute_pos_ts ON paper_mtm_minute (position_id, ts DESC);"
    )
    op.execute(
        "SELECT add_retention_policy('paper_mtm_minute', INTERVAL '180 days', "
        "if_not_exists => TRUE);"
    )

    op.execute(
        """
        CREATE TABLE paper_events (
          id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          position_id BIGINT REFERENCES paper_positions(id) ON DELETE SET NULL,
          kind        TEXT NOT NULL,
          detail      JSONB NOT NULL DEFAULT '{}'::jsonb,
          ts          TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        """
    )
    op.execute("CREATE INDEX ix_paper_events_position_ts ON paper_events (position_id, ts DESC);")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS paper_events CASCADE;")
    op.execute("DROP TABLE IF EXISTS paper_mtm_minute CASCADE;")
    op.execute("DROP TABLE IF EXISTS paper_fills CASCADE;")
    op.execute("DROP TABLE IF EXISTS paper_legs CASCADE;")
    op.execute("DROP TABLE IF EXISTS paper_positions CASCADE;")
    op.execute("DROP TABLE IF EXISTS strategies CASCADE;")
    op.execute("DROP TYPE IF EXISTS fill_kind;")
    op.execute("DROP TYPE IF EXISTS leg_side;")
    op.execute("DROP TYPE IF EXISTS leg_status;")
    op.execute("DROP TYPE IF EXISTS position_status;")
    op.execute("ALTER TABLE products DROP COLUMN IF EXISTS contract_size;")
