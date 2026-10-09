"""Builds the per-process context from settings, for the API and for the worker."""

from datetime import timedelta

from arq.connections import ArqRedis, RedisSettings, create_pool

from vaada.clock import Clock, SystemClock, TravellingClock
from vaada.config import Settings, check_boot_guards
from vaada.context import AppContext
from vaada.db import make_engine, make_session_factory
from vaada.money.fake_gateway import FakeGateway
from vaada.money.fake_store import PostgresFakeStore
from vaada.money.gateway import PaymentsGateway
from vaada.money.razorpay_gateway import RazorpayGateway


async def build_context(settings: Settings, *, pool_size: int = 10) -> AppContext:
    check_boot_guards(settings)
    engine = make_engine(settings.database_url, pool_size=pool_size)
    sessions = make_session_factory(engine)
    clock: Clock = TravellingClock(sessions) if settings.dev_tools_enabled else SystemClock()
    await clock.refresh()
    gateway: PaymentsGateway
    if settings.payments_gateway == "fake":
        store = PostgresFakeStore(engine)
        await store.create_schema()
        gateway = FakeGateway(
            store,
            clock,
            key_id=settings.fake_gateway_key_id,
            key_secret=settings.fake_gateway_key_secret,
            webhook_secret=settings.fake_gateway_webhook_secret,
            gateway_fee_bps=settings.gateway_fee_bps,
            route_transfer_fee_bps=settings.route_transfer_fee_bps,
            activation_delay=timedelta(seconds=settings.fake_gateway_activation_seconds),
        )
    else:
        gateway = RazorpayGateway(
            key_id=settings.razorpay_key_id,
            key_secret=settings.razorpay_key_secret,
            webhook_secret=settings.razorpay_webhook_secret,
        )
    return AppContext(settings=settings, engine=engine, sessions=sessions, clock=clock, gateway=gateway)


def redis_settings(settings: Settings) -> RedisSettings:
    return RedisSettings.from_dsn(settings.redis_url)


async def job_queue(settings: Settings) -> ArqRedis:
    return await create_pool(redis_settings(settings))
