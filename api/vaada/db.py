from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

SessionFactory = async_sessionmaker[AsyncSession]


def async_url(url: str) -> str:
    if url.startswith("postgresql+asyncpg://"):
        return url
    for prefix in ("postgresql://", "postgres://"):
        if url.startswith(prefix):
            return "postgresql+asyncpg://" + url[len(prefix) :]
    raise ValueError("DATABASE_URL must be a postgres URL")


def make_engine(url: str, *, pool_size: int = 10) -> AsyncEngine:
    connect_args: dict[str, object] = {"server_settings": {"timezone": "UTC"}}
    if "pooler.supabase.com" in url:
        # Supabase's transaction pooler cannot keep asyncpg's prepared statements between transactions.
        connect_args["statement_cache_size"] = 0
    return create_async_engine(async_url(url), pool_pre_ping=True, pool_size=pool_size, connect_args=connect_args)


def make_session_factory(engine: AsyncEngine) -> SessionFactory:
    return async_sessionmaker(engine, expire_on_commit=False)


@asynccontextmanager
async def transaction(factory: SessionFactory) -> AsyncIterator[AsyncSession]:
    async with factory() as session, session.begin():
        yield session
