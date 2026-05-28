"""FastAPI application entrypoint.

The lifespan handler runs the public-data bootstrap, opens the single shared Delta
WS connection, and starts the normalizer / spot-indexer / minute-aggregator
background tasks. All are torn down cleanly on shutdown.
"""

from __future__ import annotations

import asyncio
import contextlib
from collections.abc import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import health, products, stream
from app.api.responses import DecimalJSONResponse
from app.core.config import settings
from app.core.logging import logger, setup_logging
from app.db.session import dispose_engine
from app.services.bootstrap import bootstrap_products
from app.services.delta_ws import DeltaWSClient
from app.services.redis_bus import close_bus, get_bus
from app.services.runtime import get_runtime, reset_runtime
from app.workers.minute_aggregator import MinuteAggregator
from app.workers.spot_indexer import SpotIndexer
from app.workers.tick_normalizer import TickNormalizer


@contextlib.asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    setup_logging()
    runtime = get_runtime()
    bus = get_bus()
    tasks: list[asyncio.Task[None]] = []

    underlying = settings.underlying_list[0] if settings.underlying_list else "BTC"
    ws = DeltaWSClient(bus=bus)
    runtime.ws = ws

    try:
        result = await bootstrap_products(underlying=underlying, bus=bus)
        if result.option_symbols:
            ws.subscribe("v2/ticker", result.option_symbols)
        ws.subscribe("candlestick_1m", [result.futures_symbol])
        ws.subscribe("spot_price", [result.spot_symbol])
        logger.info("bootstrap ok", symbols=len(result.option_symbols))
    except Exception as exc:
        logger.warning("bootstrap failed; starting degraded", error=str(exc))

    normalizer = TickNormalizer(runtime.buffer, bus=bus)
    spot = SpotIndexer(runtime.buffer, bus=bus)
    aggregator = MinuteAggregator(runtime.buffer)

    tasks.append(asyncio.create_task(ws.run()))
    tasks.append(asyncio.create_task(normalizer.run()))
    tasks.append(asyncio.create_task(spot.run()))
    tasks.append(asyncio.create_task(aggregator.run()))
    logger.info("delta-trader backend started", tasks=len(tasks))

    try:
        yield
    finally:
        ws.stop()
        normalizer.stop()
        spot.stop()
        aggregator.stop()
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        await close_bus()
        await dispose_engine()
        reset_runtime()
        logger.info("delta-trader backend stopped")


app = FastAPI(
    title="Delta Trader",
    version="0.1.0",
    default_response_class=DecimalJSONResponse,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(products.router)
app.include_router(stream.router)
