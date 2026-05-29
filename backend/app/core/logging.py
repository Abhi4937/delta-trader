"""Loguru-based structured logging setup.

Use structured fields, never f-string-embedded values:

    logger.info("tick received", symbol=symbol, mark=mark_price)
"""

from __future__ import annotations

import sys

from loguru import logger

from app.core.config import settings

_configured = False


def setup_logging() -> None:
    """Configure the global loguru sink. Idempotent."""
    global _configured
    if _configured:
        return
    logger.remove()
    logger.add(
        sys.stderr,
        level=settings.log_level.upper(),
        backtrace=False,
        diagnose=False,
        serialize=False,
        enqueue=True,
        format=(
            "<green>{time:YYYY-MM-DD HH:mm:ss.SSS}</green> "
            "<level>{level: <8}</level> "
            "<cyan>{name}</cyan>:<cyan>{function}</cyan> - "
            "<level>{message}</level> {extra}"
        ),
    )
    _configured = True


__all__ = ["logger", "setup_logging"]
