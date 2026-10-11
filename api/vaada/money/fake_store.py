"""Where FakeGateway keeps its pretend Razorpay. In tests, a dict. In dev and demo, Postgres schema
`fakegw`, because the API and the worker are separate processes and must see the same fake."""

import asyncio
import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Protocol

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncEngine

FAKEGW_LOCK = 0x5641414441


@dataclass(frozen=True)
class QueuedEvent:
    seq: int
    event: dict[str, Any]


class FakeTx(Protocol):
    async def get(self, kind: str, id_: str) -> dict[str, Any] | None: ...

    async def put(self, kind: str, id_: str, data: dict[str, Any]) -> None: ...

    async def all(self, kind: str) -> list[dict[str, Any]]: ...

    async def emit(self, event: dict[str, Any], deliver_after: datetime) -> None: ...


class FakeStore(Protocol):
    def atomic(self) -> Any: ...

    async def due_events(self, now: datetime, limit: int) -> list[QueuedEvent]: ...

    async def mark_delivered(self, seq: int, now: datetime) -> None: ...


class MemoryFakeStore:
    def __init__(self) -> None:
        self.objects: dict[tuple[str, str], dict[str, Any]] = {}
        self.events: list[dict[str, Any]] = []
        self._lock = asyncio.Lock()

    @asynccontextmanager
    async def atomic(self) -> AsyncIterator["MemoryFakeStore"]:
        async with self._lock:
            yield self

    async def get(self, kind: str, id_: str) -> dict[str, Any] | None:
        found = self.objects.get((kind, id_))
        return json.loads(json.dumps(found)) if found is not None else None

    async def put(self, kind: str, id_: str, data: dict[str, Any]) -> None:
        self.objects[(kind, id_)] = json.loads(json.dumps(data))

    async def all(self, kind: str) -> list[dict[str, Any]]:
        return [json.loads(json.dumps(v)) for (k, _), v in self.objects.items() if k == kind]

    async def emit(self, event: dict[str, Any], deliver_after: datetime) -> None:
        self.events.append({"seq": len(self.events) + 1, "event": event, "after": deliver_after, "delivered": None})

    async def due_events(self, now: datetime, limit: int) -> list[QueuedEvent]:
        due = [e for e in self.events if e["delivered"] is None and e["after"] <= now]
        return [QueuedEvent(seq=e["seq"], event=e["event"]) for e in due[:limit]]

    async def mark_delivered(self, seq: int, now: datetime) -> None:
        self.events[seq - 1]["delivered"] = now


class _PgTx:
    def __init__(self, conn: AsyncConnection) -> None:
        self._conn = conn

    async def get(self, kind: str, id_: str) -> dict[str, Any] | None:
        row = await self._conn.execute(
            text("SELECT data FROM fakegw.objects WHERE kind = :kind AND id = :id"), {"kind": kind, "id": id_}
        )
        value = row.scalar_one_or_none()
        return dict(value) if value is not None else None

    async def put(self, kind: str, id_: str, data: dict[str, Any]) -> None:
        await self._conn.execute(
            text(
                "INSERT INTO fakegw.objects (kind, id, data) VALUES (:kind, :id, CAST(:data AS jsonb)) "
                "ON CONFLICT (kind, id) DO UPDATE SET data = EXCLUDED.data"
            ),
            {"kind": kind, "id": id_, "data": json.dumps(data)},
        )

    async def all(self, kind: str) -> list[dict[str, Any]]:
        rows = await self._conn.execute(text("SELECT data FROM fakegw.objects WHERE kind = :kind"), {"kind": kind})
        return [dict(r) for r in rows.scalars()]

    async def emit(self, event: dict[str, Any], deliver_after: datetime) -> None:
        await self._conn.execute(
            text("INSERT INTO fakegw.events (event, deliver_after) VALUES (CAST(:event AS jsonb), :after)"),
            {"event": json.dumps(event), "after": deliver_after},
        )


class PostgresFakeStore:
    def __init__(self, engine: AsyncEngine) -> None:
        self._engine = engine

    async def create_schema(self) -> None:
        async with self._engine.begin() as conn:
            await conn.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": FAKEGW_LOCK})
            await conn.execute(text("CREATE SCHEMA IF NOT EXISTS fakegw"))
            await conn.execute(
                text(
                    "CREATE TABLE IF NOT EXISTS fakegw.objects ("
                    "kind text NOT NULL, id text NOT NULL, data jsonb NOT NULL, PRIMARY KEY (kind, id))"
                )
            )
            await conn.execute(
                text(
                    "CREATE TABLE IF NOT EXISTS fakegw.events ("
                    "seq bigserial PRIMARY KEY, event jsonb NOT NULL, deliver_after timestamptz NOT NULL, "
                    "delivered_at timestamptz)"
                )
            )

    @asynccontextmanager
    async def atomic(self) -> AsyncIterator[_PgTx]:
        async with self._engine.begin() as conn:
            await conn.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": FAKEGW_LOCK})
            yield _PgTx(conn)

    async def due_events(self, now: datetime, limit: int) -> list[QueuedEvent]:
        async with self._engine.begin() as conn:
            rows = await conn.execute(
                text(
                    "SELECT seq, event FROM fakegw.events WHERE delivered_at IS NULL AND deliver_after <= :now "
                    "ORDER BY seq LIMIT :limit"
                ),
                {"now": now, "limit": limit},
            )
            return [QueuedEvent(seq=r.seq, event=dict(r.event)) for r in rows]

    async def mark_delivered(self, seq: int, now: datetime) -> None:
        async with self._engine.begin() as conn:
            await conn.execute(
                text("UPDATE fakegw.events SET delivered_at = :now WHERE seq = :seq"), {"now": now, "seq": seq}
            )
