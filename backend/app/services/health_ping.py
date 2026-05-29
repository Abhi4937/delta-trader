"""Healthchecks.io heartbeat (ADR 0006 §3): ping a URL every 60s so a missed
ping (process down) alerts you. No-op unless ``healthcheck_ping_url`` is set."""

from __future__ import annotations

import asyncio

import httpx

from app.core.config import settings
from app.core.logging import logger

_INTERVAL = 60.0


class HealthPinger:
    def __init__(self) -> None:
        self._running = False

    async def run(self) -> None:
        url = settings.healthcheck_ping_url
        if not url:
            return  # disabled
        self._running = True
        logger.info("health pinger started")
        async with httpx.AsyncClient(timeout=10) as client:
            while self._running:
                try:
                    await client.get(url)
                except Exception as exc:
                    logger.warning("health ping failed", error=str(exc))
                await asyncio.sleep(_INTERVAL)

    def stop(self) -> None:
        self._running = False
