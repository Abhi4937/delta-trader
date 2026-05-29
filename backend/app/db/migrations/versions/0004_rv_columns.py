"""indicators phase: add rv_intraday/rv_historical to *_mtm_minute

Revision ID: 0004_rv_columns
Revises: 0003_live_monitor
Create Date: 2026-05-28

Greeks (net_*) and strategy_iv already exist on both minute tables (Phase 2/3);
only the realized-vol columns are new.
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0004_rv_columns"
down_revision: str | None = "0003_live_monitor"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TABLES = ("paper_mtm_minute", "live_mtm_minute")


def upgrade() -> None:
    for table in _TABLES:
        op.execute(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS rv_intraday NUMERIC(10,6);")
        op.execute(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS rv_historical NUMERIC(10,6);")


def downgrade() -> None:
    for table in _TABLES:
        op.execute(f"ALTER TABLE {table} DROP COLUMN IF EXISTS rv_intraday;")
        op.execute(f"ALTER TABLE {table} DROP COLUMN IF EXISTS rv_historical;")
