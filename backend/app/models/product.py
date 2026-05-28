"""Product (instrument) ORM model — one row per Delta product."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, Integer, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Product(Base):
    __tablename__ = "products"

    product_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    symbol: Mapped[str] = mapped_column(String, unique=True, nullable=False, index=True)
    contract_type: Mapped[str] = mapped_column(String, nullable=False)
    underlying: Mapped[str] = mapped_column(String, nullable=False)
    strike: Mapped[Decimal | None] = mapped_column(Numeric(20, 8), nullable=True)
    expiry_code: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
