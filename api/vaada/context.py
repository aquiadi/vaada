from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field

from sqlalchemy.ext.asyncio import AsyncEngine

from vaada.clock import Clock
from vaada.config import Settings
from vaada.db import SessionFactory
from vaada.money.gateway import PaymentsGateway


async def _no_kick(_job: str) -> None:
    return None


@dataclass
class AppContext:
    """Everything a request handler or a job needs, built once per process."""

    settings: Settings
    engine: AsyncEngine
    sessions: SessionFactory
    clock: Clock
    gateway: PaymentsGateway
    kick: Callable[[str], Awaitable[None]] = field(default=_no_kick)
    """Asks the worker to run a job now. Best effort: every job also runs on a schedule."""
