"""JSON helpers that serialize ``Decimal`` as strings (never float).

Money safety (CLAUDE.md rule #3): Decimals must cross the wire as strings so no
float rounding is introduced in the browser.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any

import orjson


def _default(obj: Any) -> Any:
    if isinstance(obj, Decimal):
        return str(obj)
    if isinstance(obj, datetime):
        return obj.isoformat()
    raise TypeError(f"Type {type(obj)!r} is not JSON serializable")


def dumps(obj: Any) -> str:
    """Serialize to a JSON string, emitting Decimal as string."""
    return orjson.dumps(obj, default=_default).decode("utf-8")


def loads(data: str | bytes) -> Any:
    return orjson.loads(data)
