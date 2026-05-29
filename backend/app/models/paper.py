"""ORM models for the paper-trade engine (ADR 0003 §1, §9).

Postgres ENUM columns are mapped as ``str`` (the DB enforces the enum; the enum
types are created by the Alembic migration, not by SQLAlchemy). Money is
``Numeric(20,8)`` -> ``Decimal``.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, Numeric, String, func
from sqlalchemy.dialects.postgresql import ENUM, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

# Reuse the Postgres ENUM types created by the Alembic migration (do not re-create).
_position_status = ENUM(
    "open", "partially_closed", "closed", name="position_status", create_type=False
)
_leg_status = ENUM("open", "partially_closed", "closed", name="leg_status", create_type=False)
_leg_side = ENUM("buy", "sell", name="leg_side", create_type=False)
_fill_kind = ENUM("entry", "close", name="fill_kind", create_type=False)


class Strategy(Base):
    __tablename__ = "strategies"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    underlying: Mapped[str] = mapped_column(String, nullable=False, default="BTC")
    spec: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class PaperPosition(Base):
    __tablename__ = "paper_positions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    strategy_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("strategies.id"), nullable=False
    )
    underlying: Mapped[str] = mapped_column(String, nullable=False, default="BTC")
    status: Mapped[str] = mapped_column(_position_status, nullable=False, default="open")
    opened_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    entry_cost: Mapped[Decimal] = mapped_column(Numeric(20, 8), nullable=False)
    realized_pnl: Mapped[Decimal] = mapped_column(Numeric(20, 8), nullable=False, default=0)
    margin_estimate: Mapped[Decimal] = mapped_column(Numeric(20, 8), nullable=False, default=0)
    flags: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)


class PaperLeg(Base):
    __tablename__ = "paper_legs"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    position_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("paper_positions.id", ondelete="CASCADE"), nullable=False
    )
    symbol: Mapped[str] = mapped_column(String, nullable=False)
    product_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("products.product_id"), nullable=True
    )
    side: Mapped[str] = mapped_column(_leg_side, nullable=False)
    qty: Mapped[Decimal] = mapped_column(Numeric(20, 8), nullable=False)
    qty_open: Mapped[Decimal] = mapped_column(Numeric(20, 8), nullable=False)
    contract_size: Mapped[Decimal] = mapped_column(Numeric(20, 8), nullable=False)
    entry_fill: Mapped[Decimal] = mapped_column(Numeric(20, 8), nullable=False)
    exit_fill: Mapped[Decimal | None] = mapped_column(Numeric(20, 8), nullable=True)
    status: Mapped[str] = mapped_column(_leg_status, nullable=False, default="open")


class PaperFill(Base):
    __tablename__ = "paper_fills"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    leg_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("paper_legs.id", ondelete="CASCADE"), nullable=False
    )
    kind: Mapped[str] = mapped_column(_fill_kind, nullable=False)
    side: Mapped[str] = mapped_column(_leg_side, nullable=False)
    qty: Mapped[Decimal] = mapped_column(Numeric(20, 8), nullable=False)
    vwap: Mapped[Decimal] = mapped_column(Numeric(20, 8), nullable=False)
    impact: Mapped[Decimal] = mapped_column(Numeric(20, 8), nullable=False)
    fill_price: Mapped[Decimal] = mapped_column(Numeric(20, 8), nullable=False)
    book_snapshot: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    ts: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
