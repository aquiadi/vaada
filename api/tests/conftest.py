import asyncio
import os
import secrets
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from pathlib import Path

import asyncpg
import pytest
from alembic.config import Config

from alembic import command
from vaada.clock import ManualClock
from vaada.config import Settings
from vaada.context import AppContext
from vaada.db import make_engine, make_session_factory
from vaada.money.fake_gateway import FakeGateway
from vaada.money.fake_store import MemoryFakeStore

ADMIN_URL = os.environ.get("TEST_DATABASE_ADMIN_URL", "postgresql://postgres:postgres@127.0.0.1:54322/postgres")
TEMPLATE = "vaada_test_template"
API_DIR = Path(__file__).resolve().parent.parent

# Fri 9 Oct 2026, 12:00 IST
START = datetime(2026, 10, 9, 6, 30, tzinfo=UTC)


def _url_for(db: str) -> str:
    base, _, _ = ADMIN_URL.rpartition("/")
    return f"{base}/{db}"


async def _admin(sql: str) -> None:
    conn = await asyncpg.connect(ADMIN_URL)
    try:
        await conn.execute(sql)
    finally:
        await conn.close()


@pytest.fixture(scope="session")
def template_db() -> str:
    asyncio.run(_admin(f'DROP DATABASE IF EXISTS "{TEMPLATE}"'))
    asyncio.run(_admin(f'CREATE DATABASE "{TEMPLATE}"'))
    config = Config(str(API_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(API_DIR / "alembic"))
    previous = os.environ.get("DATABASE_URL")
    os.environ["DATABASE_URL"] = _url_for(TEMPLATE)
    try:
        command.upgrade(config, "head")
    finally:
        if previous is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = previous
    return TEMPLATE


@pytest.fixture
async def db_url(template_db: str) -> AsyncIterator[str]:
    name = f"vaada_test_{secrets.token_hex(6)}"
    await _admin(f'CREATE DATABASE "{name}" TEMPLATE "{template_db}"')
    try:
        yield _url_for(name)
    finally:
        await _admin(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)')


def make_settings(db_url: str, **overrides: object) -> Settings:
    values: dict[str, object] = {
        "vaada_env": "dev",
        "database_url": db_url,
        "supabase_url": "http://127.0.0.1:54321",
        "web_origin": "http://localhost:5173",
        "ref_hmac_secret": "r" * 40,
        "payments_gateway": "fake",
        "persona_switcher_enabled": True,
        "persona_token_secret": "p" * 40,
        "dev_tools_enabled": True,
        "email_transport": "outbox",
        "admin_emails": "aj@vaada.test",
        "rate_limit_enabled": False,
    }
    values.update(overrides)
    return Settings(**values)  # type: ignore[arg-type]


@pytest.fixture
def settings_overrides() -> dict[str, object]:
    return {}


@pytest.fixture
async def ctx(db_url: str, settings_overrides: dict[str, object]) -> AsyncIterator[AppContext]:
    settings = make_settings(db_url, **settings_overrides)
    engine = make_engine(db_url, pool_size=5)
    clock = ManualClock(START)
    gateway = FakeGateway(
        MemoryFakeStore(),
        clock,
        key_id=settings.fake_gateway_key_id,
        key_secret=settings.fake_gateway_key_secret,
        webhook_secret=settings.fake_gateway_webhook_secret,
        gateway_fee_bps=settings.gateway_fee_bps,
        route_transfer_fee_bps=settings.route_transfer_fee_bps,
    )
    context = AppContext(
        settings=settings, engine=engine, sessions=make_session_factory(engine), clock=clock, gateway=gateway
    )
    try:
        yield context
    finally:
        await engine.dispose()
