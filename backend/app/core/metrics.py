"""Prometheus metrics (ADR 0006 / Phase 5 §3). Module-level singletons incremented
at key sites; exposed at ``/metrics``."""

from __future__ import annotations

from prometheus_client import Counter, Histogram

ticks_received = Counter("ticks_received_total", "Normalized Delta frames received")
ticks_persisted = Counter("ticks_persisted_total", "Minute bars written to Postgres")
paper_strategies_executed = Counter("paper_strategies_executed_total", "Paper strategies executed")
sl_triggered = Counter("sl_triggered_total", "Stop-loss triggers fired")
delta_api_errors = Counter("delta_api_errors_total", "Delta REST/WS errors")
delta_ws_reconnects = Counter("delta_ws_reconnect_count", "Delta WS reconnects")

mtm_compute_duration_ms = Histogram(
    "mtm_compute_duration_ms",
    "Per-tick paper MTM compute time (ms)",
    buckets=(1, 2, 5, 10, 25, 50, 100, 200, 500),
)
