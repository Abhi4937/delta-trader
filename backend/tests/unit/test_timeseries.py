"""Timeseries field-mapping + injection guard, and candles cacheability (ADR 0005)."""

from __future__ import annotations

import pytest

from app.api.timeseries import FIELD_MAP, read_timeseries


def test_field_map_aliases() -> None:
    assert FIELD_MAP["delta"] == "net_delta"
    assert FIELD_MAP["iv"] == "strategy_iv"
    assert FIELD_MAP["rv_intraday"] == "rv_intraday"
    # unknown aliases simply aren't in the map (filtered out before SQL)
    assert "drop_table" not in FIELD_MAP


async def test_read_timeseries_rejects_bad_table() -> None:
    with pytest.raises(ValueError, match="invalid table"):
        await read_timeseries("ticks_minute; DROP TABLE x", "position_id", 1, "close")


async def test_read_timeseries_rejects_bad_id_column() -> None:
    with pytest.raises(ValueError, match="invalid table"):
        await read_timeseries("paper_mtm_minute", "id; --", 1, "close")
