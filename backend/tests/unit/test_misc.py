"""Unit tests for config, JSON encoding, bootstrap parsing, and the Tick model."""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

from app.core.config import Settings
from app.models.market import Tick
from app.services.bootstrap import _nearest_expiry, parse_expiry_code
from app.utils import json as jsonutil


def test_settings_dsn_and_underlyings() -> None:
    s = Settings(postgres_user="u", postgres_password="p", postgres_host="h", postgres_db="d")
    assert s.pg_dsn == "postgresql+asyncpg://u:p@h:5432/d"
    assert s.pg_dsn_sync == "postgresql://u:p@h:5432/d"
    s2 = Settings(underlyings="BTC, eth ,SOL")
    assert s2.underlying_list == ["BTC", "ETH", "SOL"]


def test_json_emits_decimal_as_string() -> None:
    out = jsonutil.dumps({"px": Decimal("1.50"), "n": 3})
    assert '"px":"1.50"' in out
    assert jsonutil.loads(out)["px"] == "1.50"


def test_parse_expiry_code() -> None:
    assert parse_expiry_code("C-BTC-90000-310125") == "31-01-2025"
    assert parse_expiry_code("BTCUSD") is None
    assert parse_expiry_code("C-BTC-90000-XXYYZZ") is None


def test_nearest_expiry_prefers_future() -> None:
    past = datetime(2020, 1, 1, tzinfo=UTC)
    near = datetime(2999, 1, 1, tzinfo=UTC)
    far = datetime(2999, 6, 1, tzinfo=UTC)
    nearest = _nearest_expiry({"01-01-2020": past, "01-01-2999": near, "01-06-2999": far})
    assert nearest == "01-01-2999"


def test_tick_to_redis_mapping_omits_none() -> None:
    tick = Tick(
        symbol="C-BTC-1-1",
        channel="ticker",
        ts=datetime(2026, 5, 28, tzinfo=UTC),
        mark_price=Decimal("12.5"),
        iv=Decimal("0.25"),
    )
    mapping = tick.to_redis_mapping()
    assert mapping["symbol"] == "C-BTC-1-1"
    assert mapping["mark_price"] == "12.5"
    assert mapping["iv"] == "0.25"
    assert "delta" not in mapping  # None fields omitted
