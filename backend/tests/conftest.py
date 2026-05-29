"""Shared test fixtures and in-memory fakes (no external services required)."""

from __future__ import annotations

from typing import Any


class FakeBus:
    """In-memory stand-in for RedisBus capturing latest hashes, pubs, and sets."""

    def __init__(self) -> None:
        self.latest: dict[str, dict[str, str]] = {}
        self.published: list[tuple[str, str]] = []
        self.sets: dict[str, set[str]] = {}

    async def ping(self) -> bool:
        return True

    async def set_latest(self, key: str, mapping: dict[str, str]) -> None:
        if mapping:
            self.latest[key] = dict(mapping)

    async def set_hash(self, key: str, mapping: dict[str, str]) -> None:
        # persistent hash (no TTL) — merge into existing
        if mapping:
            self.latest.setdefault(key, {}).update(mapping)

    async def delete(self, key: str) -> None:
        self.latest.pop(key, None)

    async def get_latest(self, key: str) -> dict[str, str]:
        return self.latest.get(key, {})

    async def publish(self, channel: str, message: str) -> None:
        self.published.append((channel, message))

    async def sadd(self, key: str, *members: str) -> None:
        if members:
            self.sets.setdefault(key, set()).update(members)

    async def srem(self, key: str, *members: str) -> None:
        if key in self.sets:
            self.sets[key].difference_update(members)

    async def smembers(self, key: str) -> set[str]:
        return self.sets.get(key, set())


class FakeAsyncpgConn:
    """Records copy + execute calls instead of touching Postgres."""

    def __init__(self) -> None:
        self.copied: list[tuple[Any, ...]] = []
        self.executed: list[str] = []

    def transaction(self) -> FakeAsyncpgConn:
        return self

    async def __aenter__(self) -> FakeAsyncpgConn:
        return self

    async def __aexit__(self, *exc: object) -> None:
        return None

    async def execute(self, sql: str, *args: Any) -> None:
        self.executed.append(sql)

    async def copy_records_to_table(
        self, table: str, *, records: list[tuple[Any, ...]], columns: list[str]
    ) -> None:
        self.copied.extend(records)

    async def close(self) -> None:
        return None
