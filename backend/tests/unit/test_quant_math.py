"""Greeks aggregation, strategy IV, PnL, RV, Black-76 (ADR 0003 §4-7)."""

from __future__ import annotations

import math
from decimal import Decimal

from app.services.quant.greeks import net_signed_greeks
from app.services.quant.iv import black76_price, implied_vol, strategy_iv
from app.services.quant.pnl import entry_cost, realized_pnl_slice, unrealized_pnl
from app.services.quant.rv import historical_rv, intraday_rv
from app.services.quant.types import LegView


def _leg(sq: str, cs: str, entry: str, **kw: str) -> LegView:
    return LegView(
        signed_qty=Decimal(sq),
        contract_size=Decimal(cs),
        entry_fill=Decimal(entry),
        **{k: Decimal(v) for k, v in kw.items()},
    )


def test_net_signed_greeks_short_subtracts() -> None:
    legs = [
        _leg("1", "0.001", "100", delta="0.5", gamma="0.01"),
        _leg("-1", "0.001", "100", delta="0.5", gamma="0.01"),  # short same delta
    ]
    g = net_signed_greeks(legs)
    assert g["delta"] == Decimal(0)  # long + short cancel
    assert g["gamma"] == Decimal(0)


def test_net_signed_greeks_scaled_by_qty_and_size() -> None:
    legs = [_leg("2", "0.001", "100", delta="0.5")]
    g = net_signed_greeks(legs)
    assert g["delta"] == Decimal("2") * Decimal("0.001") * Decimal("0.5")


def test_strategy_iv_notional_weighted() -> None:
    # leg A: notional 2*100*1=200, iv 0.5 ; leg B: notional 1*100*1=100, iv 0.2
    legs = [_leg("2", "1", "100", iv="0.5"), _leg("1", "1", "100", iv="0.2")]
    siv = strategy_iv(legs)
    assert siv is not None
    expected = (Decimal("200") * Decimal("0.5") + Decimal("100") * Decimal("0.2")) / Decimal("300")
    assert siv == expected


def test_strategy_iv_none_when_no_iv() -> None:
    assert strategy_iv([_leg("1", "1", "100")]) is None


def test_entry_cost_sign() -> None:
    # buy 1 @100 (debit +), sell 1 @40 (credit -) => 100 - 40 = 60 net debit
    legs = [_leg("1", "1", "100"), _leg("-1", "1", "40")]
    assert entry_cost(legs) == Decimal("60")


def test_unrealized_pnl_long_and_short() -> None:
    # long 1 @100 now 110 => +10 ; short 1 @100 now 110 => -10
    long_leg = _leg("1", "1", "100", mark="110")
    short_leg = _leg("-1", "1", "100", mark="110")
    assert unrealized_pnl([long_leg]) == Decimal("10")
    assert unrealized_pnl([short_leg]) == Decimal("-10")


def test_realized_close_short_below_entry_is_profit() -> None:
    # short entry 100 (signed -1), buy back at 80 => profit 20
    pnl = realized_pnl_slice(Decimal("-1"), Decimal("100"), Decimal("80"), Decimal("1"))
    assert pnl == Decimal("20")


def test_historical_rv_matches_numpy_reference() -> None:
    closes = [Decimal(str(p)) for p in (100, 101, 99, 102, 103, 101)]
    rv = historical_rv(closes)
    assert rv is not None
    rets = [
        math.log(b / a)
        for a, b in zip([100, 101, 99, 102, 103], [101, 99, 102, 103, 101], strict=False)
    ]
    mean = sum(rets) / len(rets)
    var = sum((r - mean) ** 2 for r in rets) / (len(rets) - 1)
    expected = math.sqrt(var) * math.sqrt(365)
    assert abs(float(rv) - expected) < 1e-6


def test_intraday_rv_annualizes_by_minutes() -> None:
    closes = [Decimal(str(p)) for p in (100, 100.5, 100.2, 100.8)]
    rv = intraday_rv(closes)
    assert rv is not None
    assert rv > 0


def test_black76_put_call_parity() -> None:
    f, k, t, sigma, r = 100.0, 100.0, 0.5, 0.4, 0.05
    call = black76_price(f, k, t, sigma, r, is_call=True)
    put = black76_price(f, k, t, sigma, r, is_call=False)
    # C - P = e^{-rT}(F - K) ; F=K so ~0
    assert abs((call - put) - math.exp(-r * t) * (f - k)) < 1e-9


def test_implied_vol_roundtrip() -> None:
    f, k, t, r, sigma = Decimal("100"), Decimal("100"), Decimal("0.5"), Decimal("0.05"), 0.4
    price = Decimal(str(black76_price(100.0, 100.0, 0.5, sigma, 0.05, True)))
    recovered = implied_vol(price, f, k, t, r, is_call=True)
    assert recovered is not None
    assert abs(float(recovered) - sigma) < 1e-3
