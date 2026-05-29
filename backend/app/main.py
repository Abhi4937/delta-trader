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
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address

from app.api import health, live, metrics, paper, products, spot, stream
from app.api.auth_token import BearerTokenMiddleware
from app.api.responses import DecimalJSONResponse
from app.core.config import settings
from app.core.logging import logger, setup_logging
from app.db.session import dispose_engine
from app.services.bootstrap import bootstrap_products
from app.services.delta_rest import DeltaRestClient
from app.services.delta_ws import DeltaWSClient
from app.services.health_ping import HealthPinger
from app.services.live.closer import LiveCloser
from app.services.live.order_sync import OrderSync
from app.services.live.position_sync import PositionSync
from app.services.live.sl_monitor import SLMonitor
from app.services.paper.mtm_worker import PaperMtmWorker
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
    paper_mtm = PaperMtmWorker(bus=bus)

    # Live monitor (Section 2) — read-only sync + stop-loss monitor. The auth gate
    # makes these no-ops until Delta API keys are configured.
    live_rest = DeltaRestClient()
    position_sync = PositionSync(rest=live_rest, bus=bus)
    order_sync = OrderSync(rest=live_rest, bus=bus)
    sl_mon = SLMonitor(closer=LiveCloser(rest=live_rest, bus=bus), bus=bus)
    pinger = HealthPinger()

    tasks.append(asyncio.create_task(ws.run()))
    tasks.append(asyncio.create_task(normalizer.run()))
    tasks.append(asyncio.create_task(spot.run()))
    tasks.append(asyncio.create_task(aggregator.run()))
    tasks.append(asyncio.create_task(paper_mtm.run()))
    tasks.append(asyncio.create_task(position_sync.run()))
    tasks.append(asyncio.create_task(order_sync.run()))
    tasks.append(asyncio.create_task(sl_mon.run()))
    tasks.append(asyncio.create_task(pinger.run()))
    logger.info("delta-trader backend started", tasks=len(tasks))

    try:
        yield
    finally:
        ws.stop()
        normalizer.stop()
        spot.stop()
        aggregator.stop()
        paper_mtm.stop()
        position_sync.stop()
        order_sync.stop()
        sl_mon.stop()
        pinger.stop()
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        await live_rest.aclose()
        await close_bus()
        await dispose_engine()
        reset_runtime()
        logger.info("delta-trader backend stopped")


app = FastAPI(
    title="Delta Trader",
    version="1.0.0",
    default_response_class=DecimalJSONResponse,
    lifespan=lifespan,
)

# Per-IP rate limiting (default 60/min/route); 429 on exceed.
limiter = Limiter(key_func=get_remote_address, default_limits=["60/minute"])
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)  # type: ignore[arg-type]

# Order matters (last added = outermost): CORS -> bearer gate -> rate limit -> app.
app.add_middleware(SlowAPIMiddleware)
app.add_middleware(BearerTokenMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(products.router)
app.include_router(paper.router)
app.include_router(live.router)
app.include_router(spot.router)
app.include_router(metrics.router)
app.include_router(stream.router)
