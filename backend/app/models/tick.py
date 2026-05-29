"""Minute-bar ORM model (Timescale hypertable ``ticks_minute``).

The hypertable conversion + retention policy are applied via raw SQL in the
Alembic migration, not here (SQLAlchemy only knows the plain table).
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class TickMinute(Base):
    __tablename__ = "ticks_minute"

    symbol: Mapped[str] = mapped_column(String, primary_key=True)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), primary_key=True)
    open: Mapped[Decimal | None] = mapped_column(Numeric(20, 8), nullable=True)
    high: Mapped[Decimal | None] = mapped_column(Numeric(20, 8), nullable=True)
    low: Mapped[Decimal | None] = mapped_column(Numeric(20, 8), nullable=True)
    close: Mapped[Decimal | None] = mapped_column(Numeric(20, 8), nullable=True)
    mark_price: Mapped[Decimal | None] = mapped_column(Numeric(20, 8), nullable=True)
    iv: Mapped[Decimal | None] = mapped_column(Numeric(10, 6), nullable=True)
    delta: Mapped[Decimal | None] = mapped_column(Numeric(10, 6), nullable=True)
    gamma: Mapped[Decimal | None] = mapped_column(Numeric(10, 6), nullable=True)
    theta: Mapped[Decimal | None] = mapped_column(Numeric(10, 6), nullable=True)
    vega: Mapped[Decimal | None] = mapped_column(Numeric(10, 6), nullable=True)
    oi: Mapped[Decimal | None] = mapped_column(Numeric(20, 8), nullable=True)
    volume: Mapped[Decimal | None] = mapped_column(Numeric(20, 8), nullable=True)
