---
name: timeseries-db
description: Use when creating or modifying time-series tables, hypertables, continuous aggregates, retention policies, or Parquet archival in the trading platform.
---

# TimescaleDB conventions for this repo

## Hypertables
Every time-series table is a Timescale hypertable. Standard config:
```sql
SELECT create_hypertable('ticks_minute', 'ts', chunk_time_interval => INTERVAL '1 day');
```

## Schema pattern
```sql
CREATE TABLE ticks_minute (
  ts          TIMESTAMPTZ NOT NULL,
  symbol      TEXT NOT NULL,
  open        NUMERIC(20,8),
  high        NUMERIC(20,8),
  low         NUMERIC(20,8),
  close       NUMERIC(20,8),
  mark_price  NUMERIC(20,8),
  iv          NUMERIC(10,6),
  delta       NUMERIC(10,6),
  gamma       NUMERIC(10,6),
  theta       NUMERIC(10,6),
  vega        NUMERIC(10,6),
  oi          NUMERIC(20,8),
  volume      NUMERIC(20,8),
  PRIMARY KEY (symbol, ts)
);
```

## Continuous aggregates (for charts)
```sql
CREATE MATERIALIZED VIEW ticks_hourly
WITH (timescaledb.continuous) AS
SELECT time_bucket('1 hour', ts) AS bucket, symbol,
       first(open, ts) AS open, max(high) AS high,
       min(low) AS low, last(close, ts) AS close
FROM ticks_minute
GROUP BY bucket, symbol;
```

## Retention + archival
- Keep minute data online for 90 days (`add_retention_policy`).
- Older data: export to Parquet partitioned `year=/month=/symbol=` under `PARQUET_DIR`.
- Use `pyarrow` writer; compression `zstd`.

## Performance rules
- Always include `ts` in WHERE clauses with a range. Never `SELECT * FROM ticks_minute` without a time filter.
- For paper-trade MTM history queries (per-strategy), use a non-hypertable `trade_mtm_log` table keyed by `(strategy_id, ts)`.
- Inserts batch via COPY (asyncpg `copy_records_to_table`) for >100 rows.
