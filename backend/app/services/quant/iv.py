r"""Strategy IV (notional-weighted) + a Black-76 IV inversion for validation.

Strategy IV (ADR 0003 §5): ``Σ |notional_i| * iv_i / Σ |notional_i|`` over legs
with a known mark IV. The Newton-Raphson inversion is used only on validation
paths (the live path trusts Delta's ``mark_vol``); it is the only place floats are
used, and only for the vol solver — never for money.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from decimal import Decimal

from app.services.quant.types import LegView


def strategy_iv(legs: Sequence[LegView]) -> Decimal | None:
    num = Decimal(0)
    den = Decimal(0)
    for leg in legs:
        if leg.iv is None:
            continue
        w = leg.abs_notional
        num += w * leg.iv
        den += w
    if den == 0:
        return None
    return num / den


def _norm_cdf(x: float) -> float:
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def _norm_pdf(x: float) -> float:
    return math.exp(-0.5 * x * x) / math.sqrt(2.0 * math.pi)


def black76_price(
    forward: float, strike: float, t: float, sigma: float, r: float, is_call: bool
) -> float:
    """Black-76 price for a futures-style option (validation use)."""
    if t <= 0 or sigma <= 0:
        intrinsic = max(forward - strike, 0.0) if is_call else max(strike - forward, 0.0)
        return math.exp(-r * t) * intrinsic
    d1 = (math.log(forward / strike) + 0.5 * sigma * sigma * t) / (sigma * math.sqrt(t))
    d2 = d1 - sigma * math.sqrt(t)
    disc = math.exp(-r * t)
    if is_call:
        return disc * (forward * _norm_cdf(d1) - strike * _norm_cdf(d2))
    return disc * (strike * _norm_cdf(-d2) - forward * _norm_cdf(-d1))


def implied_vol(
    price: Decimal,
    forward: Decimal,
    strike: Decimal,
    t: Decimal,
    r: Decimal,
    is_call: bool,
    *,
    max_iter: int = 30,
    tol: float = 1e-6,
) -> Decimal | None:
    """Newton-Raphson IV inversion (validation only). Returns sigma or None."""
    f, kk, tt, rr, target = (float(forward), float(strike), float(t), float(r), float(price))
    if tt <= 0 or f <= 0 or kk <= 0:
        return None
    sigma = max(0.2, math.sqrt(2.0 * math.pi / tt) * abs(target) / f)  # Brenner-Subrahmanyam
    for _ in range(max_iter):
        model = black76_price(f, kk, tt, sigma, rr, is_call)
        d1 = (math.log(f / kk) + 0.5 * sigma * sigma * tt) / (sigma * math.sqrt(tt))
        vega = math.exp(-rr * tt) * f * _norm_pdf(d1) * math.sqrt(tt)
        if vega < 1e-12:
            break
        diff = model - target
        if abs(diff) < tol:
            return Decimal(str(round(sigma, 6)))
        sigma -= diff / vega
        if sigma <= 0:
            sigma = 1e-4
    return None
