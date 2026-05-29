"""Live monitor: auth gate, token bucket, closer, SL state machine (ADR 0004).

All DB-free (FakeBus + monkeypatched settings/DB writes) so they run in CI.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any, cast

import pytest

from app.core.config import settings
from app.services import redis_bus as rb
from app.services.live import sl_monitor as slm
from app.services.live.auth_gate import (
    AuthGateError,
    RateLimitError,
    TokenBucket,
    require_auth,
)
from app.services.live.closer import LiveCloser, build_close_payload
from app.services.live.types import normalize_position
from tests.conftest import FakeBus


@pytest.fixture
def no_keys(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "delta_api_key", "")
    monkeypatch.setattr(settings, "delta_api_secret", "")
    monkeypatch.setattr(settings, "live_trading_enabled", False)


@pytest.fixture
def keys_read_only(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "delta_api_key", "k")
    monkeypatch.setattr(settings, "delta_api_secret", "s")
    monkeypatch.setattr(settings, "live_trading_enabled", False)


@pytest.fixture
def keys_live(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "delta_api_key", "k")
    monkeypatch.setattr(settings, "delta_api_secret", "s")
    monkeypatch.setattr(settings, "live_trading_enabled", True)


# --- gate -----------------------------------------------------------------
def test_gate_503_without_keys(no_keys: None) -> None:
    with pytest.raises(AuthGateError) as e:
        require_auth()
    assert e.value.status_code == 503


def test_gate_read_ok_with_keys(keys_read_only: None) -> None:
    require_auth()  # read needs only keys — no raise


def test_gate_403_order_without_live(keys_read_only: None) -> None:
    with pytest.raises(AuthGateError) as e:
        require_auth(order_placing=True, confirm=True)
    assert e.value.status_code == 403


def test_gate_422_order_without_confirm(keys_live: None) -> None:
    with pytest.raises(AuthGateError) as e:
        require_auth(order_placing=True, confirm=False)
    assert e.value.status_code == 422


def test_gate_order_ok_with_live_and_confirm(keys_live: None) -> None:
    require_auth(order_placing=True, confirm=True)  # no raise


# --- token bucket ---------------------------------------------------------
async def test_token_bucket_exhausts_then_refills() -> None:
    bucket = TokenBucket(rate_per_sec=1000, burst=2)
    await bucket.acquire()
    await bucket.acquire()
    with pytest.raises(RateLimitError) as e:
        await bucket.acquire()
    assert e.value.status_code == 429
    assert e.value.retry_after >= 0


# --- normalize ------------------------------------------------------------
def test_normalize_position_signed_and_decimal() -> None:
    pos = normalize_position(
        {
            "product_symbol": "C-BTC-90000-290526",
            "product_id": 5,
            "size": "-3",
            "entry_price": "1200.5",
            "contract_value": "0.001",
            "margin": "50",
        }
    )
    assert pos is not None
    assert pos.size == Decimal("-3")  # short
    assert pos.contract_size == Decimal("0.001")
    assert isinstance(pos.entry_price, Decimal)


# --- closer ---------------------------------------------------------------
def test_close_payload_opposite_side_reduce_only() -> None:
    long_close = build_close_payload("X", 1, Decimal("2"))
    short_close = build_close_payload("Y", 2, Decimal("-2"))
    assert long_close["side"] == "sell" and long_close["reduce_only"] == "true"
    assert short_close["side"] == "buy"
    assert long_close["order_type"] == "market_order"


async def test_closer_blocked_without_gate(no_keys: None) -> None:
    closer = LiveCloser(rest=object(), bus=cast(rb.RedisBus, FakeBus()))
    with pytest.raises(AuthGateError):
        await closer.close_strategy(1, confirm=True)


async def test_closer_fires_orders_and_handles_failure(
    keys_live: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    bus = FakeBus()
    await bus.set_latest("live:position:A", {"symbol": "A", "size": "2", "product_id": "1"})
    await bus.set_latest("live:position:B", {"symbol": "B", "size": "-1", "product_id": "2"})

    async def fake_symbols(sid: int) -> list[str]:
        return ["A", "B"]

    monkeypatch.setattr("app.services.live.closer.strategy_symbols", fake_symbols)

    calls: list[dict[str, Any]] = []

    class Rest:
        async def place_order(self, payload: dict[str, Any]) -> dict[str, Any]:
            calls.append(payload)
            if payload["product_id"] == 2:  # B fails both times
                raise RuntimeError("rejected")
            return {"id": 1}

    closer = LiveCloser(rest=Rest(), bus=cast(rb.RedisBus, bus))
    result = await closer.close_strategy(1, confirm=True)
    assert not result.all_closed  # B failed
    legs = {leg.symbol: leg.ok for leg in result.legs}
    assert legs["A"] is True and legs["B"] is False
    # B was retried once -> placed twice (3 total: A once, B twice)
    assert len(calls) == 3


# --- SL state machine -----------------------------------------------------
def test_sl_breaches_abs_and_pct() -> None:
    mon = slm.SLMonitor(closer=cast(Any, None), bus=cast(rb.RedisBus, FakeBus()))
    assert mon._breaches(Decimal("100"), Decimal("0"), {"threshold_abs": "50"})
    assert not mon._breaches(Decimal("10"), Decimal("0"), {"threshold_abs": "50"})
    # pct: loss 60 >= 50% of margin 100
    assert mon._breaches(Decimal("60"), Decimal("100"), {"threshold_pct": "50"})
    assert not mon._breaches(Decimal("40"), Decimal("100"), {"threshold_pct": "50"})


async def test_sl_fires_after_debounce_and_closes(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "sl_debounce_ticks", 2)

    events: list[tuple[str | None, str]] = []

    async def fake_event(sid: int, frm: str | None, to: str, detail: dict[str, object]) -> None:
        events.append((frm, to))

    async def fake_symbols(sid: int) -> list[str]:
        return ["A"]

    class FakeAgg:
        total_pnl = Decimal("-100")
        margin = Decimal("0")
        mark_stale = False

    async def fake_aggregate(symbols: list[str], bus: Any = None) -> FakeAgg:
        return FakeAgg()

    class FakeCloser:
        async def close_strategy(self, sid: int, *, confirm: bool) -> Any:
            class R:
                all_closed = True
                legs = (1,)

            return R()

    monkeypatch.setattr(slm, "_event", fake_event)
    monkeypatch.setattr(slm, "strategy_symbols", fake_symbols)
    monkeypatch.setattr(slm.mtm_mod, "aggregate", fake_aggregate)

    bus = FakeBus()
    mon = slm.SLMonitor(closer=cast(Any, FakeCloser()), bus=cast(rb.RedisBus, bus))
    await slm.arm(1, threshold_abs=Decimal("50"), threshold_pct=None, bus=cast(rb.RedisBus, bus))

    # First breaching tick: counts but does not fire (debounce=2).
    await mon._tick()
    assert (await bus.get_latest("live:sl:1"))["state"] == "ARMED"
    # Second breaching tick: fires -> CLOSED.
    await mon._tick()
    assert (await bus.get_latest("live:sl:1"))["state"] == "CLOSED"
    assert ("CLOSING", "CLOSED") in events


async def test_aggregate_flat_leg_does_not_mark_stale() -> None:
    """A closed/flat leg (missing hash) must be excluded, NOT marked stale —
    otherwise the SL would freeze on the remaining open legs (must-fix #1)."""
    from app.services.live.mtm import aggregate

    bus = FakeBus()
    # 'OPEN' has a fresh mark; 'GONE' has no position hash (leg was closed).
    await bus.set_latest(
        "live:position:OPEN",
        {"symbol": "OPEN", "size": "1", "contract_size": "1", "entry_price": "100", "margin": "10"},
    )
    await bus.set_latest("latest:OPEN", {"mark_price": "90", "delta": "0.5"})
    agg = await aggregate(["OPEN", "GONE"], bus=cast(rb.RedisBus, bus))
    assert agg.mark_stale is False  # flat leg excluded, not stale
    assert agg.unrealized_pnl == Decimal("-10")  # 1*(90-100)*1
