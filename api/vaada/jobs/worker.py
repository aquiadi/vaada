"""The arq worker. Run with: arq vaada.jobs.worker.WorkerSettings"""

import logging
from typing import Any, ClassVar

import httpx
from arq import cron, func

from vaada import deals
from vaada.build import build_context, redis_settings
from vaada.config import get_settings
from vaada.email.sender import send_queued
from vaada.jobs import tasks
from vaada.logs import configure_logging, configure_sentry
from vaada.money import delivery, disputes, webhooks
from vaada.registry.recorder import make_recorder, post_pending

log = logging.getLogger(__name__)
settings = get_settings()


async def startup(ctx: dict[str, Any]) -> None:
    configure_logging(settings)
    configure_sentry(settings, "worker")
    app = await build_context(settings, pool_size=5)

    async def kick(job: str) -> None:
        await ctx["redis"].enqueue_job(job, _job_id=f"kick:{job}")

    app.kick = kick
    ctx["app"] = app
    ctx["recorder"] = make_recorder(settings)
    ctx["http"] = httpx.AsyncClient(timeout=10)


async def shutdown(ctx: dict[str, Any]) -> None:
    await ctx["http"].aclose()
    await ctx["app"].engine.dispose()


async def _fresh(ctx: dict[str, Any]) -> Any:
    app = ctx["app"]
    await app.clock.refresh()
    return app


async def process_webhooks(ctx: dict[str, Any]) -> int:
    return await webhooks.process_pending(await _fresh(ctx))


async def send_emails(ctx: dict[str, Any]) -> int:
    return await send_queued(await _fresh(ctx), client=ctx["http"])


async def post_registry(ctx: dict[str, Any]) -> int:
    return await post_pending(await _fresh(ctx), ctx["recorder"])


async def confirm_releases(ctx: dict[str, Any]) -> int:
    return await delivery.confirm_expired_holds(await _fresh(ctx))


async def review_reminders(ctx: dict[str, Any]) -> int:
    return await delivery.send_review_reminders(await _fresh(ctx))


async def lapse(ctx: dict[str, Any]) -> int:
    return await deals.lapse_overdue(await _fresh(ctx))


async def dispute_holds(ctx: dict[str, Any]) -> int:
    return await disputes.enforce_open_holds(await _fresh(ctx))


async def reconcile(ctx: dict[str, Any]) -> int:
    return await tasks.reconcile(ctx["app"])


async def fake_webhooks(ctx: dict[str, Any]) -> int:
    return await tasks.deliver_fake_webhooks(await _fresh(ctx), ctx["http"])


async def tick(ctx: dict[str, Any]) -> dict[str, Any]:
    return await tasks.run_tick(ctx["app"], ctx["recorder"])


EVERY_TWO_SECONDS = set(range(0, 60, 2))
EVERY_TEN_SECONDS = set(range(0, 60, 10))
EVERY_FIVE_MINUTES = set(range(0, 60, 5))
EVERY_FIFTEEN_MINUTES = {0, 15, 30, 45}


def _crons() -> list[Any]:
    fast = settings.is_sandbox
    jobs = [
        cron(process_webhooks, second=EVERY_TEN_SECONDS if fast else {0}, run_at_startup=True, keep_result=0),
        cron(send_emails, second=EVERY_TEN_SECONDS, keep_result=0),
        cron(post_registry, second=EVERY_TEN_SECONDS if fast else {0, 30}, keep_result=0),
        cron(
            confirm_releases,
            second={0, 30} if fast else {0},
            minute=None if fast else EVERY_FIVE_MINUTES,
            keep_result=0,
        ),
        cron(review_reminders, minute=EVERY_FIVE_MINUTES if fast else EVERY_FIFTEEN_MINUTES, keep_result=0),
        cron(lapse, minute=EVERY_FIVE_MINUTES if fast else EVERY_FIFTEEN_MINUTES, keep_result=0),
        cron(dispute_holds, second={15}, keep_result=0),
        cron(reconcile, minute=EVERY_FIFTEEN_MINUTES, second={45}, keep_result=0),
    ]
    if settings.payments_gateway == "fake":
        jobs.append(cron(fake_webhooks, second=EVERY_TWO_SECONDS, keep_result=0))
    return jobs


class WorkerSettings:
    functions: ClassVar[list[Any]] = [
        func(process_webhooks, keep_result=0),
        func(send_emails, keep_result=0),
        func(post_registry, keep_result=0),
        func(tick, keep_result=0),
    ]
    cron_jobs: ClassVar[list[Any]] = _crons()
    on_startup = startup
    on_shutdown = shutdown
    redis_settings = redis_settings(settings)
    max_jobs = 4
    job_timeout = 300
