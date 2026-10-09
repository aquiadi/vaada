from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert

from vaada.db import SessionFactory, transaction
from vaada.models import AppState

OFFSET_KEY = "clock_offset_seconds"


class Clock:
    def now(self) -> datetime:
        raise NotImplementedError

    async def refresh(self) -> None:
        """Reload any shared state the clock depends on. A no-op unless time travel is on."""


class SystemClock(Clock):
    def now(self) -> datetime:
        return datetime.now(UTC)


class TravellingClock(Clock):
    """Dev and demo only (boot guards enforce it): real time plus an offset shared through the
    database, so the API, the worker and FakeGateway all agree that five days have passed."""

    def __init__(self, factory: SessionFactory) -> None:
        self._factory = factory
        self._offset = timedelta(0)

    def now(self) -> datetime:
        return datetime.now(UTC) + self._offset

    @property
    def offset(self) -> timedelta:
        return self._offset

    async def refresh(self) -> None:
        async with self._factory() as session:
            value = await session.scalar(select(AppState.value).where(AppState.key == OFFSET_KEY))
        self._offset = timedelta(seconds=int(value or 0))

    async def advance(self, delta: timedelta) -> None:
        await self.refresh()
        seconds = int((self._offset + delta).total_seconds())
        async with transaction(self._factory) as session:
            stmt = insert(AppState).values(key=OFFSET_KEY, value=seconds)
            await session.execute(stmt.on_conflict_do_update(index_elements=[AppState.key], set_={"value": seconds}))
        self._offset = timedelta(seconds=seconds)


class ManualClock(Clock):
    def __init__(self, start: datetime) -> None:
        self._now = start

    def now(self) -> datetime:
        return self._now

    def advance(self, delta: timedelta) -> None:
        self._now += delta

    def set(self, moment: datetime) -> None:
        self._now = moment
