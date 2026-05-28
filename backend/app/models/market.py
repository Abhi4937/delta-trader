"""Normalized in-memory market-data shapes (the hot path).

Distinct from the ORM models: these are frozen pydantic v2 models passed between
the WS ingestor, normalizer, workers, Redis, and the frontend WS hub. Every
money/greek field is ``Decimal`` (CLAUDE.md rule #3).
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict

Channel = Literal["ticker", "spot", "candle"]


class Tick(BaseModel):
    """A normalized market update for one symbol at one instant."""

    model_config = ConfigDict(frozen=True)

    symbol: str
    channel: Channel
    ts: datetime
    mark_price: Decimal | None = None
    iv: Decimal | None = None  # sigma, already divided by 100
    delta: Decimal | None = None
    gamma: Decimal | None = None
    theta: Decimal | None = None
    vega: Decimal | None = None
    oi: Decimal | None = None
    volume: Decimal | None = None
    best_bid: Decimal | None = None
    best_ask: Decimal | None = None

    # Candle-only fields (channel == "candle")
    open: Decimal | None = None
    high: Decimal | None = None
    low: Decimal | None = None
    close: Decimal | None = None

    def to_redis_mapping(self) -> dict[str, str]:
        """Flatten to a string->string hash for ``HSET latest:{symbol}``.

        Decimals serialize as strings (money safety); ``None`` fields are omitted.
        """
        mapping: dict[str, str] = {"symbol": self.symbol, "ts": self.ts.isoformat()}
        for fld in (
            "mark_price",
            "iv",
            "delta",
            "gamma",
            "theta",
            "vega",
            "oi",
            "volume",
            "best_bid",
            "best_ask",
            "open",
            "high",
            "low",
            "close",
        ):
            val: Decimal | None = getattr(self, fld)
            if val is not None:
                mapping[fld] = str(val)
        return mapping
