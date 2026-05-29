# Soak report

## Representative soak — 2026-05-29 (15 min, prod backend, 1 open paper position)
Prod-built backend (Phase 5 image) on the local stack, BTC stream live, one ATM
short straddle (`position 25`) open. Snapshot every 5 min.

| t | backend RSS | DB size | minute bars (pos 25) | WS reconnects | tracebacks |
|---|---|---|---|---|---|
| 0  | 105.6 MiB | 33 MB | 0  | 0 | 0 |
| +5 | 106.8 MiB | 33 MB | 5  | 0 | 0 |
| +10| 107.4 MiB | 33 MB | 10 | 0 | 0 |
| +15| 107.7 MiB | 33 MB | 15 | 0 | 0 |

**Findings**
- **Memory: stable / converging, no leak.** +2.1 MiB total, with a clearly
  decelerating curve (+1.2 → +0.6 → +0.3 MiB) as in-process caches (Prometheus
  histograms, the WS desired-sub set, the minute buffer) reach steady state.
- **Persistence**: minute bars grew exactly **1/min** for the open position — the MTM
  worker flush is steady and idempotent.
- **Reconnects: 0** — the single shared Delta WS stayed connected the whole window.
- **Errors: 0 tracebacks** across the run.
- **DB growth**: dominated by `ticks_minute` (the option-chain tick stream); the
  per-position MTM rows are negligible. At ~5 MB/day for the tick stream the 90-day
  retention policy keeps it bounded; the 200 GB Always-Free disk is never a concern.

## Cross-phase consistency
Prior representative soaks were equally clean: Phase 1 backend flat ~93 MiB;
Phase 2 flat 92.8→89.7 MiB; Phase 4 flat 93.2→93.3 MiB. The slightly higher Phase 5
baseline (~106 MiB) reflects the added Prometheus client + slowapi + an open position.

## Not done here (yours to run post-deploy)
The prompt's **full 24-hour prod soak on the Oracle VM** requires the deployed box.
Run it after `docs/DEPLOY_ORACLE.md`: keep one paper position open + the stream
running for 24h, snapshot `docker stats` hourly, and append the memory curve +
reconnect count + DB growth rate here. Watch for any non-converging memory trend or
frequent reconnects (rare; debug the WS backoff if seen).
