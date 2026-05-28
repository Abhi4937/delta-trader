"""Process-wide runtime handles shared between the lifespan, workers, and API.

Holds the singleton minute buffer and the Delta WS client so ``/health/deep`` and
the frontend WS hub can read live status without circular imports.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.services.delta_ws import DeltaWSClient
from app.workers.minute_buffer import MinuteBuffer


@dataclass
class Runtime:
    buffer: MinuteBuffer = field(default_factory=MinuteBuffer)
    ws: DeltaWSClient | None = None

    @property
    def ws_connected(self) -> bool:
        return self.ws is not None and self.ws.connected


_runtime: Runtime | None = None


def get_runtime() -> Runtime:
    global _runtime
    if _runtime is None:
        _runtime = Runtime()
    return _runtime


def reset_runtime() -> None:
    global _runtime
    _runtime = None
