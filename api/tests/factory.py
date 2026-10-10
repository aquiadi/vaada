"""Builders for tests: people, payout accounts, drafts, and deeds at every stage of their life."""

import secrets
import uuid
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any, Literal

from sqlalchemy import func, select

from vaada import deals
from vaada.agreement import ist_date
from vaada.context import AppContext
from vaada.db import transaction
from vaada.models import Deal, LedgerEntry, Milestone, PayoutAccount, User
from vaada.models.enums import LedgerKind, PayoutStatus
from vaada.money import delivery, funding, webhooks
from vaada.money.fake_gateway import FakeGateway
from vaada.money.fake_store import MemoryFakeStore, QueuedEvent
from vaada.terms import Draft


async def make_user(ctx: AppContext, name: str, email: str | None = None) -> User:
    async with transaction(ctx.sessions) as session:
        user = User(
            id=uuid.uuid4(),
            email=email or f"{name.split()[0].lower()}.{secrets.token_hex(3)}@example.com",
            display_name=name,
            handle=f"{name.split()[0].lower()}{secrets.token_hex(2)}",
            maker_id="0x" + secrets.token_hex(32),
        )
        session.add(user)
        return user


async def give_payouts(ctx: AppContext, user: User, *, bank_last4: str = "4417") -> PayoutAccount:
    gateway = ctx.gateway
    assert isinstance(gateway, FakeGateway)
    account_id, stakeholder_id, product_id = await gateway.seed_activated_account(
        legal_name=user.display_name or "Maker", email=user.email or "", bank_last4=bank_last4
    )
    async with transaction(ctx.sessions) as session:
        account = PayoutAccount(
            user_id=user.id,
            razorpay_account_id=account_id,
            stakeholder_id=stakeholder_id,
            product_config_id=product_id,
            status=PayoutStatus.ACTIVATED,
            legal_name=user.display_name,
            business_type="individual",
            bank_last4=bank_last4,
            ifsc="HDFC0001234",
            activated_at=ctx.clock.now(),
        )
        session.add(account)
        return account


def blank(value: Any, raw: str | None = None) -> dict[str, Any]:
    return {"raw": raw if raw is not None else str(value), "value": value, "confidence": "exact", "note": None}


@dataclass
class Part:
    amount_paise: int
    days: int
    title: str = "Part"
    deliverables: str = "The files described above."


def draft_for(
    ctx: AppContext,
    parts: list[Part],
    *,
    maker: str = "Aditi Rao",
    client: str = "Rahul Mehta",
    organisation: str | None = "Kiln Labs",
    revisions: int | str = 3,
    kill_fee: int | None = None,
    struck: list[str] | None = None,
) -> Draft:
    today = ist_date(ctx.clock.now())
    blanks: dict[str, Any] = {
        "maker_name": blank(maker),
        "client_name": blank(client),
        "work": blank("a logo and brand guidelines"),
        "revisions": blank(revisions),
        "total": blank(sum(p.amount_paise for p in parts)),
    }
    strikes = list(struck if struck is not None else ["late_fee", "ip_transfer"])
    if organisation is None:
        strikes.append("client_organisation")
    else:
        blanks["client_organisation"] = blank(organisation)
    if kill_fee is None:
        strikes.append("kill_fee")
    else:
        blanks["kill_fee.percent"] = blank(kill_fee)
    for i, part in enumerate(parts, start=1):
        due: date = today + timedelta(days=part.days)
        blanks[f"milestones.{i}.title"] = blank(f"{part.title} {i}" if part.title == "Part" else part.title)
        blanks[f"milestones.{i}.deliverables"] = blank(part.deliverables)
        blanks[f"milestones.{i}.amount"] = blank(part.amount_paise)
        blanks[f"milestones.{i}.due"] = blank(due.isoformat())
    return Draft.model_validate({"blanks": blanks, "struck": sorted(set(strikes)), "milestone_count": len(parts)})


@dataclass
class Scene:
    maker: User
    client: User
    deal: Deal


TWO_HALVES = [Part(1_250_000, 10, "Advance"), Part(1_250_000, 20, "On delivery")]


async def published(ctx: AppContext, parts: list[Part] | None = None, **draft_args: Any) -> Scene:
    maker = await make_user(ctx, "Aditi Rao")
    client = await make_user(ctx, "Rahul Mehta")
    await give_payouts(ctx, maker)
    deal = await deals.create_draft(ctx, maker, draft_for(ctx, parts or TWO_HALVES, **draft_args))
    deal = await deals.publish(ctx, deal.id, maker, client.email or "")
    return Scene(maker, client, deal)


async def accepted(ctx: AppContext, parts: list[Part] | None = None, **draft_args: Any) -> Scene:
    scene = await published(ctx, parts, **draft_args)
    await deals.accept(
        ctx, scene.deal.id, scene.client, name_typed="Rahul Mehta", agreed=True, ip="10.0.0.1", user_agent="test"
    )
    return scene


async def pump(ctx: AppContext, *, order: str = "fifo", duplicate: bool = False) -> int:
    """Delivers FakeGateway's queued webhooks to our ingest path, then processes them."""
    gateway = ctx.gateway
    assert isinstance(gateway, FakeGateway)
    deliveries = await gateway.due_deliveries()
    if order == "reverse":
        deliveries = list(reversed(deliveries))
    sends = [d for d in deliveries for _ in range(2 if duplicate else 1)]
    for d in sends:
        await webhooks.ingest(ctx, d.body, d.signature, d.event_id)
    for d in deliveries:
        await gateway.mark_delivered(d.seq)
    await webhooks.process_pending(ctx)
    return len(deliveries)


async def resend_everything(ctx: AppContext) -> None:
    """Razorpay retries: every event it ever sent arrives once more."""
    gateway = fake(ctx)
    store = gateway._store
    assert isinstance(store, MemoryFakeStore)
    for queued in store.events:
        d = gateway.delivery_for(QueuedEvent(seq=queued["seq"], event=queued["event"]))
        await webhooks.ingest(ctx, d.body, d.signature, d.event_id)


async def funded(
    ctx: AppContext,
    parts: list[Part] | None = None,
    *,
    method: Literal["upi", "netbanking", "card"] = "upi",
    **draft_args: Any,
) -> Scene:
    scene = await accepted(ctx, parts, **draft_args)
    config = await funding.create_order(ctx, scene.deal.id, scene.client)
    gateway = ctx.gateway
    assert isinstance(gateway, FakeGateway)
    response = await gateway.simulate_checkout(config.order_id, method=method)
    await funding.record_checkout_return(
        ctx,
        scene.deal.id,
        scene.client,
        order_id=response["razorpay_order_id"],
        payment_id=response["razorpay_payment_id"],
        signature=response["razorpay_signature"],
    )
    await pump(ctx)
    scene.deal = await reload(ctx, scene.deal.id)
    return scene


async def delivered(ctx: AppContext, parts: list[Part] | None = None, idx: int = 1, **draft_args: Any) -> Scene:
    scene = await funded(ctx, parts, **draft_args)
    await delivery.deliver(ctx, milestone(scene.deal, idx).id, scene.maker, "Final files are in the Drive folder.")
    scene.deal = await reload(ctx, scene.deal.id)
    return scene


async def reload(ctx: AppContext, deal_id: uuid.UUID) -> Deal:
    async with ctx.sessions() as session:
        deal = (await session.execute(select(Deal).where(Deal.id == deal_id))).scalar_one()
        await session.refresh(deal, ["milestones"])
        return deal


def milestone(deal: Deal, idx: int) -> Milestone:
    return next(m for m in deal.milestones if m.idx == idx)


async def ledger_rows(ctx: AppContext, deal_id: uuid.UUID) -> list[LedgerEntry]:
    async with ctx.sessions() as session:
        return list(
            (
                await session.execute(
                    select(LedgerEntry).where(LedgerEntry.deal_id == deal_id).order_by(LedgerEntry.id)
                )
            ).scalars()
        )


async def ledger_total(ctx: AppContext, deal_id: uuid.UUID, kind: LedgerKind) -> int:
    async with ctx.sessions() as session:
        value = await session.scalar(
            select(func.coalesce(func.sum(LedgerEntry.amount_paise), 0)).where(
                LedgerEntry.deal_id == deal_id, LedgerEntry.kind == kind
            )
        )
        return int(value or 0)


def fake(ctx: AppContext) -> FakeGateway:
    assert isinstance(ctx.gateway, FakeGateway)
    return ctx.gateway
