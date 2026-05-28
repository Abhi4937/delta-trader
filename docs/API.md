# API

Auto-generated from the FastAPI OpenAPI schema (Delta Trader 0.1.0). Regenerate: `curl http://localhost:8001/openapi.json -o docs/openapi.json`

| Method | Path | Summary |
|---|---|---|
| GET | `/expiries` | List Expiries |
| GET | `/health` | Health |
| GET | `/health/deep` | Health Deep |
| GET | `/option-chain` | Option Chain |
| GET | `/paper/positions` | List Positions |
| POST | `/paper/positions/{position_id}/close` | Close Position |
| GET | `/paper/positions/{position_id}/mtm` | Position Mtm |
| GET | `/paper/strategies` | List Strategies |
| POST | `/paper/strategies` | Create Or Preview |
| POST | `/paper/strategies/execute` | Execute Strategy |
| GET | `/products` | List Products |

WebSocket `/ws`: subscribe with {"sub":"option_chain|candles|paper_position", ...}; all Decimal values are JSON strings. See ADR 0002 (section 7) and ADR 0003 (section 10).
