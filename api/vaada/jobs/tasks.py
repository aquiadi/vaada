"""Background work. The worker schedules these; `run_tick` runs the periodic ones at once for dev."""

import logging
import random
from typing import Any

import httpx

from vaada import deals
from vaada.context import AppContext
from vaada.email.sender import send_queued
from vaada.money import delivery, disputes, reconciliation, webhooks
from vaada.money.fake_gateway import FakeDelivery, FakeGateway
from vaada.registry.recorder import Recorder, post_pending

log = logging.getLogger(__name__)


async def deliver_fake_webhooks(ctx: AppContext, client: httpx.AsyncClient) -> int:
    """FakeGateway's webhooks go over HTTP to our own endpoint, signed, like Razorpay's would. With
    FAKE_GATEWAY_CHAOS set they also arrive shuffled and twice."""
    gateway = ctx.gateway
    if not isinstance(gateway, FakeGateway):
        return 0
    deliveries: list[FakeDelivery] = await gateway.due_deliveries()
    chaos = ctx.settings.fake_gateway_chaos
    sends = list(deliveries)
    if "duplicate" in chaos:
        sends += deliveries
    if "shuffle" in chaos:
        random.shuffle(sends)
    url = ctx.settings.api_public_url.rstrip("/") + "/webhooks/razorpay"
    delivered: set[int] = set()
    for d in sends:
        try:
            response = await client.post(
                url,
                content=d.body,
                headers={
                    "Content-Type": "application/json",
                    "X-Razorpay-Signature": d.signature,
                    "X-Razorpay-Event-Id": d.event_id,
                },
            )
            response.raise_for_status()
            delivered.add(d.seq)
        except httpx.HTTPError as exc:
            log.warning("fake webhook %s not delivered: %s", d.event_type, type(exc).__name__)
    for d in deliveries:
        if d.seq in delivered:
            await gateway.mark_delivered(d.seq)
    return len(delivered)


async def run_tick(ctx: AppContext, recorder: Recorder | None = None) -> dict[str, Any]:
    await ctx.clock.refresh()
    async with httpx.AsyncClient(timeout=10) as client:
        fake_sent = await deliver_fake_webhooks(ctx, client)
    return {
        "fake_webhooks": fake_sent,
        "webhooks": await webhooks.process_pending(ctx),
        "released": await delivery.confirm_expired_holds(ctx),
        "reminders": await delivery.send_review_reminders(ctx),
        "lapsed": await deals.lapse_overdue(ctx),
        "dispute_holds": await disputes.enforce_open_holds(ctx),
        "emails": await send_queued(ctx),
        "registry": await post_pending(ctx, recorder, wait_seconds=2.0),
    }


async def reconcile(ctx: AppContext) -> int:
    await ctx.clock.refresh()
    return await reconciliation.reconcile(ctx)
