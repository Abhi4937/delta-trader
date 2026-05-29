"""live monitor: strategies, strategy_positions, live_mtm_minute, sl_events

Revision ID: 0003_live_monitor
Revises: 0002_paper_trade
Create Date: 2026-05-28
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0003_live_monitor"
down_revision: str | None = "0002_paper_trade"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE live_strategies (
          id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          name        TEXT NOT NULL,
          created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        """
    )
    op.execute(
        """
        CREATE TABLE live_strategy_positions (
          id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          strategy_id BIGINT NOT NULL REFERENCES live_strategies(id) ON DELETE CASCADE,
          symbol      TEXT NOT NULL UNIQUE,
          product_id  INTEGER
        );
        """
    )
    op.execute(
        "CREATE INDEX ix_live_strategy_positions_strategy "
        "ON live_strategy_positions (strategy_id);"
    )

    op.execute(
        """
        CREATE TABLE live_mtm_minute (
          strategy_id    BIGINT NOT NULL REFERENCES live_strategies(id) ON DELETE CASCADE,
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
          PRIMARY KEY (strategy_id, ts)
        );
        """
    )
    op.execute(
        "SELECT create_hypertable('live_mtm_minute', 'ts', "
        "chunk_time_interval => INTERVAL '1 day', if_not_exists => TRUE);"
    )
    op.execute(
        "CREATE INDEX ix_live_mtm_minute_strat_ts ON live_mtm_minute (strategy_id, ts DESC);"
    )
    op.execute(
        "SELECT add_retention_policy('live_mtm_minute', INTERVAL '180 days', "
        "if_not_exists => TRUE);"
    )

    op.execute(
        """
        CREATE TABLE live_sl_events (
          id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          strategy_id BIGINT REFERENCES live_strategies(id) ON DELETE SET NULL,
          from_state  TEXT,
          to_state    TEXT NOT NULL,
          detail      JSONB NOT NULL DEFAULT '{}'::jsonb,
          ts          TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        """
    )
    op.execute("CREATE INDEX ix_live_sl_events_strat_ts ON live_sl_events (strategy_id, ts DESC);")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS live_sl_events CASCADE;")
    op.execute("DROP TABLE IF EXISTS live_mtm_minute CASCADE;")
    op.execute("DROP TABLE IF EXISTS live_strategy_positions CASCADE;")
    op.execute("DROP TABLE IF EXISTS live_strategies CASCADE;")
