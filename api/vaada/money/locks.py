import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncEngine

from vaada.money.errors import MoneyError


@asynccontextmanager
async def deal_lock(engine: AsyncEngine, deal_id: uuid.UUID, *, wait_seconds: int = 30) -> AsyncIterator[None]:
    """Serialises every money operation on one deal, across API processes and workers.

    A session-level advisory lock on its own connection, so the work inside can commit step by step
    (reverse, then refund) without letting a double click or a concurrent webhook interleave.
    """
    key = f"deal:{deal_id}"
    async with engine.connect() as conn:
        await conn.execute(text(f"SET lock_timeout = '{int(wait_seconds)}s'"))
        try:
            await conn.execute(text("SELECT pg_advisory_lock(hashtextextended(:k, 0))"), {"k": key})
        except DBAPIError as exc:
            raise MoneyError(
                "Another change to this deed is still going through. Try again in a moment.", code="busy"
            ) from exc
        await conn.commit()
        try:
            yield
        finally:
            await conn.execute(text("SELECT pg_advisory_unlock(hashtextextended(:k, 0))"), {"k": key})
            await conn.commit()
