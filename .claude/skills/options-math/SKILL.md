---
name: options-math
description: Use when implementing or reviewing options pricing, Greeks computation, implied/realized volatility, or PnL math.
---

# Options math reference

## Pricing model: Black-76 (futures-style, Delta uses this)
For a call: C = e^(-rT) * [F * N(d1) - K * N(d2)]
For a put:  P = e^(-rT) * [K * N(-d2) - F * N(-d1)]
where d1 = [ln(F/K) + (σ²/2)T] / (σ√T), d2 = d1 - σ√T.

F = forward (use Delta's mark_price on the future), K = strike, T = time to expiry in years (use 365 calendar days), σ = IV (decimal), r = risk-free rate.

## Greeks
- delta_call = e^(-rT) N(d1);   delta_put = -e^(-rT) N(-d1)
- gamma = e^(-rT) φ(d1) / (F σ √T)
- vega = e^(-rT) F φ(d1) √T / 100   (per 1% vol move)
- theta = decay per day; compute via finite difference dC/dT then /365
- rho = strike sensitivity to rate

Prefer Delta's published greeks. Recompute only for validation.

## IV inversion
Newton-Raphson on σ: σ_{n+1} = σ_n - (model_price - market_price) / vega
- Initial guess: σ_0 = √(2π/T) * |C - intrinsic| / F   (Brenner-Subrahmanyam)
- Max 30 iters, tol 1e-6 on price, fallback to bisection in [0.01, 5.0].

## Realized Volatility
**Historical (close-to-close, annualized):**
σ_hist = √(252 or 365) * stdev(ln(P_t / P_{t-1}))   over N days
Crypto trades 24/7 → use 365.

**Intraday rolling (Yang-Zhang preferred, but close-to-close is fine for v1):**
Use 1-minute bars from `candlestick_1m`. Window: configurable (1h, 4h, 24h). Annualize by √(365 * 1440).

## Put-Call Parity (use as a property test)
C - P = e^(-rT) * (F - K)
If this is off by >1% on a liquid strike, something is wrong with your data.

## PnL for a multi-leg position
For each leg: pnl_leg = qty_signed * (current_mark - entry_price) * contract_size
Net PnL = Σ pnl_leg. For Delta, contract_size for BTC options is 0.001 BTC; verify per product.

## Margin (initial)
Delta uses portfolio margin. For v1, approximate as max(premium_collected_short, span_estimate). The authoritative value comes from `/v2/positions/margined` — always cross-check against it.
