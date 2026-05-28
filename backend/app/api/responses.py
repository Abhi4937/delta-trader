"""Custom JSON response that serializes Decimal as string (money safety).

FastAPI's default encoder turns Decimal into float — forbidden by CLAUDE.md
rule #3. Use ``DecimalJSONResponse`` as the app-wide default response class.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any

import orjson
from starlette.responses import JSONResponse


def _default(obj: Any) -> Any:
    if isinstance(obj, Decimal):
        return str(obj)
    if isinstance(obj, datetime):
        return obj.isoformat()
    raise TypeError(f"Type {type(obj)!r} is not JSON serializable")


class DecimalJSONResponse(JSONResponse):
    media_type = "application/json"

    def render(self, content: Any) -> bytes:
        return orjson.dumps(content, default=_default)
