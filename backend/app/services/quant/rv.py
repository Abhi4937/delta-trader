r"""Realized volatility of the BTC underlying (ADR 0003 §6).

Both are close-to-close log-return standard deviations, annualized:
- historical: daily closes, annualize by ``√365`` (crypto trades 24/7).
- intraday: 1-minute closes, annualize by ``√(365*1440)``.

All Decimal (``Decimal.ln`` / ``Decimal.sqrt``); sample stdev (n-1).
"""

from __future__ import annotations

from collections.abc import Sequence
from decimal import Decimal
from itertools import pairwise

_MINUTES_PER_YEAR = 365 * 1440


def _log_returns(closes: Sequence[Decimal]) -> list[Decimal]:
    rets: list[Decimal] = []
    for prev, cur in pairwise(closes):
        if prev > 0 and cur > 0:
            rets.append((cur / prev).ln())
    return rets


def _sample_stdev(values: Sequence[Decimal]) -> Decimal | None:
    n = len(values)
    if n < 2:
        return None
    mean = sum(values, Decimal(0)) / n
    var = sum(((v - mean) ** 2 for v in values), Decimal(0)) / (n - 1)
    return var.sqrt()


def historical_rv(daily_closes: Sequence[Decimal]) -> Decimal | None:
    """Annualized close-to-close RV from daily closes (``√365``)."""
    sd = _sample_stdev(_log_returns(daily_closes))
    if sd is None:
        return None
    return sd * Decimal(365).sqrt()


def intraday_rv(minute_closes: Sequence[Decimal]) -> Decimal | None:
    """Annualized close-to-close RV from 1-minute closes (``√(365*1440)``)."""
    sd = _sample_stdev(_log_returns(minute_closes))
    if sd is None:
        return None
    return sd * Decimal(_MINUTES_PER_YEAR).sqrt()
