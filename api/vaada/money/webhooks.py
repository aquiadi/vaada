"""Razorpay webhooks: verify, store, then process in a job. Processing is idempotent and tolerates any
arrival order, so replaying a stored event is always safe."""

import hashlib
import json
import logging
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert

from vaada.context import AppContext
from vaada.db import transaction
from vaada.models import WebhookEvent
from vaada.money import funding, payouts, refunds
from vaada.money.entities import payment_from, refund_from, transfer_from

log = logging.getLogger(__name__)

MAX_ATTEMPTS = 12
REDACTED = "[redacted]"
PERSONAL_KEYS = frozenset(
    {"email", "contact", "vpa", "card", "bank_account", "customer_details", "upi", "acquirer_data"}
)


class WebhookRejectedError(Exception):
    pass


def redact(value: Any) -> Any:
    """Payer details are not needed to process an event, so they are not stored."""
    if isinstance(value, dict):
        return {k: (REDACTED if k in PERSONAL_KEYS and v not in (None, "") else redact(v)) for k, v in value.items()}
    if isinstance(value, list):
        return [redact(v) for v in value]
    return value


async def ingest(ctx: AppContext, body: bytes, signature: str | None, event_id_header: str | None) -> bool:
    """Returns True if the event is new. Raises WebhookRejectedError on a bad signature or body."""
    if not signature or not ctx.gateway.verify_webhook_signature(body, signature):
        raise WebhookRejectedError("signature mismatch")
    try:
        payload = json.loads(body)
        event_type = str(payload["event"])
    except (ValueError, KeyError, TypeError) as exc:
        raise WebhookRejectedError("unreadable body") from exc
    event_id = event_id_header or payload.get("id") or "sha256:" + hashlib.sha256(body).hexdigest()
    async with transaction(ctx.sessions) as session:
        inserted = (
            await session.execute(
                insert(WebhookEvent)
                .values(event_id=event_id, event_type=event_type, payload=redact(payload))
                .on_conflict_do_nothing(index_elements=[WebhookEvent.event_id])
                .returning(WebhookEvent.id)
            )
        ).scalar_one_or_none()
    await ctx.kick("process_webhooks")
    return inserted is not None


def _entity(payload: dict[str, Any], key: str) -> dict[str, Any] | None:
    found = (payload.get("payload") or {}).get(key) or {}
    entity = found.get("entity") if isinstance(found, dict) else None
    return entity if isinstance(entity, dict) else None


async def dispatch(ctx: AppContext, event_type: str, payload: dict[str, Any], event_id: str) -> None:
    if event_type in ("payment.captured", "order.paid"):
        entity = _entity(payload, "payment")
        if entity and entity.get("status") == "captured":
            await funding.settle_capture(ctx, payment_from(entity), webhook_event_id=event_id)
    elif event_type == "payment.authorized":
        entity = _entity(payload, "payment")
        if entity:
            await funding.payment_authorized(ctx, payment_from(entity))
    elif event_type == "payment.failed":
        entity = _entity(payload, "payment")
        if entity:
            await funding.payment_failed(ctx, payment_from(entity))
    elif event_type in ("transfer.processed", "transfer.failed", "transfers.failed"):
        entity = _entity(payload, "transfer")
        if entity:
            await funding.transfer_event(ctx, transfer_from(entity), webhook_event_id=event_id)
    elif event_type in ("refund.created", "refund.processed", "refund.failed"):
        entity = _entity(payload, "refund")
        if entity:
            await refunds.refund_event(
                ctx, refund_from(entity), failed=event_type == "refund.failed", webhook_event_id=event_id
            )
    elif event_type.startswith(("product.route.", "account.")):
        entity = _entity(payload, "merchant_product") or _entity(payload, "product") or _entity(payload, "account")
        await payouts.route_event(ctx, account_id=payload.get("account_id"), event_type=event_type, entity=entity)
    else:
        log.info("ignoring webhook type %s", event_type)


async def process_one(ctx: AppContext, event_pk: int) -> bool:
    async with ctx.sessions() as session:
        event = await session.get(WebhookEvent, event_pk)
    if event is None or event.processed_at is not None:
        return True
    try:
        await dispatch(ctx, event.event_type, event.payload, event.event_id)
    except Exception as exc:
        log.exception("webhook %s (%s) failed", event.event_id, event.event_type)
        async with transaction(ctx.sessions) as session:
            await session.execute(
                update(WebhookEvent)
                .where(WebhookEvent.id == event_pk)
                .values(attempts=WebhookEvent.attempts + 1, error=f"{type(exc).__name__}: {exc}"[:1000])
            )
        return False
    async with transaction(ctx.sessions) as session:
        await session.execute(
            update(WebhookEvent)
            .where(WebhookEvent.id == event_pk)
            .values(processed_at=ctx.clock.now(), attempts=WebhookEvent.attempts + 1, error=None)
        )
    return True


async def process_pending(ctx: AppContext, limit: int = 100) -> int:
    async with ctx.sessions() as session:
        ids = (
            (
                await session.execute(
                    select(WebhookEvent.id)
                    .where(WebhookEvent.processed_at.is_(None), WebhookEvent.attempts < MAX_ATTEMPTS)
                    .order_by(WebhookEvent.received_at, WebhookEvent.id)
                    .limit(limit)
                )
            )
            .scalars()
            .all()
        )
    processed = 0
    for event_pk in ids:
        processed += int(await process_one(ctx, event_pk))
    return processed


async def replay(ctx: AppContext, event_id: str) -> bool:
    """Admin: run a stored event through processing again. Harmless if it already ran."""
    async with transaction(ctx.sessions) as session:
        event = (await session.execute(select(WebhookEvent).where(WebhookEvent.event_id == event_id))).scalar_one()
        event.processed_at = None
        event.attempts = 0
        pk = event.id
    return await process_one(ctx, pk)
