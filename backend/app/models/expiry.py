"""Expiry ORM model — one row per (underlying, expiry_code)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Expiry(Base):
    __tablename__ = "expiries"

    underlying: Mapped[str] = mapped_column(String, primary_key=True)
    expiry_code: Mapped[str] = mapped_column(String, primary_key=True)
    expiry_ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
