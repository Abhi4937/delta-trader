# API

Auto-generated from the FastAPI OpenAPI schema (Delta Trader 0.1.0). Regenerate: `curl http://localhost:8001/openapi.json -o docs/openapi.json`

| Method | Path | Summary |
|---|---|---|
| GET | `/expiries` | List Expiries |
| GET | `/health` | Health |
| GET | `/health/deep` | Health Deep |
| GET | `/live/orders` | Orders |
| GET | `/live/positions` | Positions |
| GET | `/live/strategies` | Get Strategies |
| POST | `/live/strategies` | Post Strategy |
| GET | `/live/strategies/{strategy_id}/mtm` | Strategy Mtm |
| POST | `/live/strategies/{strategy_id}/stop-loss` | Set Stop Loss |
| DELETE | `/live/strategies/{strategy_id}/stop-loss` | Clear Stop Loss |
| GET | `/option-chain` | Option Chain |
| GET | `/paper/positions` | List Positions |
| POST | `/paper/positions/{position_id}/close` | Close Position |
| GET | `/paper/positions/{position_id}/mtm` | Position Mtm |
| GET | `/paper/strategies` | List Strategies |
| POST | `/paper/strategies` | Create Or Preview |
| POST | `/paper/strategies/execute` | Execute Strategy |
| GET | `/products` | List Products |

WebSocket `/ws`: subscribe with {"sub":"option_chain|candles|paper_position|live_positions|live_strategy", ...}; all Decimal values are JSON strings. Live (/live/*) endpoints are gated: 503 without keys, 403 without live_trading_enabled, 422 without confirm, 429 on rate limit. See ADRs 0002/0003/0004.
