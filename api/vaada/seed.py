"""Dev and demo seed: Aditi Rao (brand designer, Indore), Rahul Mehta (founder, Pune), Meenal Joshi
(publisher, Jaipur) and a desk admin, plus four of Aditi's deeds at different stages of life.

Deeds are made by the real services with the shared clock moved back in time, so every ledger row,
register line and registry record is exactly what the app would have produced.
Run: python -m vaada.seed
"""

import asyncio
import logging
import uuid
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any

from sqlalchemy import select

from vaada import deals
from vaada.agreement import ist_date
from vaada.build import build_context
from vaada.clock import TravellingClock
from vaada.config import BootGuardError, get_settings
from vaada.context import AppContext
from vaada.db import transaction
from vaada.models import Deal, Dictation, PayoutAccount, User
from vaada.models.enums import Confidence, PayoutStatus
from vaada.money import delivery, funding, webhooks
from vaada.money.fake_gateway import FakeGateway
from vaada.terms import Draft
from vaada.users import new_maker_id

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class Persona:
    key: str
    name: str
    email: str
    handle: str
    about: str


PERSONAS = [
    Persona("aditi", "Aditi Rao", "aditi@vaada.dev", "aditi-rao", "Freelance brand designer, Indore"),
    Persona("rahul", "Rahul Mehta", "rahul@kilnlabs.dev", "rahul-mehta", "Founder of Kiln Labs, Pune"),
    Persona("meenal", "Meenal Joshi", "meenal@pothibooks.dev", "meenal-joshi", "Publisher at Pothi Books, Jaipur"),
    Persona("desk", "Vaada Desk", "desk@vaada.dev", "vaada-desk", "Resolves disputes (admin)"),
]

AMOUNT_UNREADABLE = "Couldn't read an amount here. Try 'pachees hazaar' or '25000'."
DATE_UNREADABLE = "Couldn't read a date here. Try 'Friday tak', '17 Oct' or '10 din mein'."
PLAN_UNREADABLE = "Couldn't read a payment plan. Try 'aadha advance aadha delivery pe', or set the parts by hand below."


def b(raw: str, value: Any, confidence: str = "exact", note: str | None = None) -> dict[str, Any]:
    return {"raw": raw, "value": value, "confidence": confidence, "note": note}


def plan_value(parts: list[tuple[str, str, int, int]]) -> dict[str, Any]:
    """(title, stage, bps, paise) per part, in the shape the web's plan normalizer produces."""
    return {
        "parts": [{"title": t, "stage": s, "share": {"type": "percent", "bps": bps}} for t, s, bps, _ in parts],
        "milestones": [{"title": t, "stage": s, "amountPaise": paise} for t, s, _, paise in parts],
    }


async def _user(ctx: AppContext, persona: Persona) -> User:
    async with transaction(ctx.sessions) as session:
        existing = (await session.execute(select(User).where(User.email == persona.email))).scalar_one_or_none()
        if existing:
            return existing
        user = User(
            id=uuid.uuid4(),
            email=persona.email,
            display_name=persona.name,
            handle=persona.handle,
            maker_id=new_maker_id(),
            is_persona=True,
        )
        session.add(user)
        return user


async def _payouts(ctx: AppContext, user: User) -> None:
    gateway = ctx.gateway
    assert isinstance(gateway, FakeGateway)
    account_id, stakeholder_id, product_id = await gateway.seed_activated_account(
        legal_name=user.display_name or "", email=user.email or "", bank_last4="4417"
    )
    async with transaction(ctx.sessions) as session:
        session.add(
            PayoutAccount(
                user_id=user.id,
                razorpay_account_id=account_id,
                stakeholder_id=stakeholder_id,
                product_config_id=product_id,
                status=PayoutStatus.ACTIVATED,
                legal_name="Aditi Rao",
                business_type="individual",
                bank_last4="4417",
                ifsc="HDFC0001234",
                activated_at=ctx.clock.now(),
            )
        )


async def _set_offset(ctx: AppContext, target: timedelta) -> None:
    clock = ctx.clock
    assert isinstance(clock, TravellingClock)
    await clock.refresh()
    await clock.advance(target - clock.offset)


async def _pump(ctx: AppContext) -> None:
    gateway = ctx.gateway
    assert isinstance(gateway, FakeGateway)
    for d in await gateway.due_deliveries():
        await webhooks.ingest(ctx, d.body, d.signature, d.event_id)
        await gateway.mark_delivered(d.seq)
    await webhooks.process_pending(ctx)


async def _dictations(ctx: AppContext, deal_id: uuid.UUID, user: User, draft: dict[str, Any]) -> None:
    kinds = {
        "total": "amount",
        "revisions": "count",
        "plan": "plan",
        "kill_fee.percent": "count",
        "late_fee.days": "count",
    }
    async with transaction(ctx.sessions) as session:
        for field, blank in draft["blanks"].items():
            kind = kinds.get(field) or (
                "amount"
                if field.endswith("amount")
                else "date"
                if field.endswith(".due")
                else "name"
                if field.endswith("_name")
                else "text"
            )
            session.add(
                Dictation(
                    deal_id=deal_id,
                    user_id=user.id,
                    field=field,
                    kind=kind,
                    raw_text=blank["raw"],
                    normalized_value=blank["value"],
                    confidence=Confidence(blank["confidence"]),
                )
            )


def _due(today: date, days: int) -> str:
    return (today + timedelta(days=days)).isoformat()


async def _deed(
    ctx: AppContext, maker: User, client: User | None, draft: dict[str, Any], *, publish_to: str | None
) -> Deal:
    deal = await deals.create_draft(ctx, maker, Draft.model_validate(draft))
    await _dictations(ctx, deal.id, maker, draft)
    if publish_to:
        deal = await deals.publish(ctx, deal.id, maker, publish_to)
    if client is not None:
        await deals.accept(
            ctx, deal.id, client, name_typed=client.display_name or "", agreed=True, ip="10.20.30.40", user_agent="seed"
        )
    return deal


async def _pay(ctx: AppContext, deal_id: uuid.UUID, client: User) -> None:
    gateway = ctx.gateway
    assert isinstance(gateway, FakeGateway)
    config = await funding.create_order(ctx, deal_id, client)
    response = await gateway.simulate_checkout(config.order_id, method="upi", email=client.email or "")
    await funding.record_checkout_return(
        ctx,
        deal_id,
        client,
        order_id=config.order_id,
        payment_id=response["razorpay_payment_id"],
        signature=response["razorpay_signature"],
    )
    await _pump(ctx)


async def seed(ctx: AppContext) -> bool:
    if not ctx.settings.is_sandbox:
        raise BootGuardError("Seeding only runs in dev and demo.")
    async with ctx.sessions() as session:
        if (await session.execute(select(User).where(User.email == PERSONAS[0].email))).scalar_one_or_none():
            log.info("already seeded")
            return False
    aditi, rahul, meenal, _desk = [await _user(ctx, p) for p in PERSONAS]
    await _payouts(ctx, aditi)
    assert isinstance(ctx.clock, TravellingClock)
    await ctx.clock.refresh()
    home = ctx.clock.offset

    # Completed: Meenal's book cover, a month ago.
    await _set_offset(ctx, home - timedelta(days=40))
    today = ist_date(ctx.clock.now())
    cover = {
        "blanks": {
            "maker_name": b("Aditi Rao.", "Aditi Rao"),
            "client_name": b("Meenal Joshi.", "Meenal Joshi"),
            "client_organisation": b("Pothi Books, Jaipur.", "Pothi Books, Jaipur"),
            "work": b(
                "Registan Ki Raat ke liye book cover, front, spine aur back.",
                "Registan Ki Raat ke liye book cover, front, spine aur back",
            ),
            "revisions": b("Do revisions.", 2),
            "total": b("Atharah hazaar.", 1_800_000),
            "plan": b(
                "Aadha advance, aadha delivery pe.",
                plan_value([("Advance", "advance", 5000, 900_000), ("On delivery", "delivery", 5000, 900_000)]),
            ),
            "milestones.1.title": b("Advance", "Advance"),
            "milestones.1.deliverables": b("Teen cover concepts, pencil roughs.", "Teen cover concepts, pencil roughs"),
            "milestones.1.amount": b("Nau hazaar.", 900_000),
            "milestones.1.due": b("Agle Monday tak.", _due(today, 7), "inferred", 'Read "next Monday" as a week out.'),
            "milestones.2.title": b("On delivery", "On delivery"),
            "milestones.2.deliverables": b(
                "Final print-ready PDF with bleed, aur ebook cover JPG.",
                "Final print-ready PDF with bleed, aur ebook cover JPG",
            ),
            "milestones.2.amount": b("Nau hazaar.", 900_000),
            "milestones.2.due": b("Teen hafte mein.", _due(today, 21)),
            "ip_transfer.exclusions": b(
                "Rough sketches aur unused concepts, aur portfolio mein dikhane ka haq.",
                "Rough sketches aur unused concepts, aur portfolio mein dikhane ka haq",
            ),
        },
        "struck": ["kill_fee", "late_fee"],
        "milestone_count": 2,
    }
    deal = await _deed(ctx, aditi, meenal, cover, publish_to=meenal.email)
    await _pay(ctx, deal.id, meenal)
    deal = await _reload(ctx, deal.id)
    await _set_offset(ctx, home - timedelta(days=36))
    await delivery.deliver(ctx, deal.milestones[0].id, aditi, "Teeno concepts Drive folder mein hain.")
    await _set_offset(ctx, home - timedelta(days=35))
    await delivery.approve(ctx, deal.milestones[0].id, meenal)
    await _set_offset(ctx, home - timedelta(days=20))
    await delivery.deliver(ctx, deal.milestones[1].id, aditi, "Print PDF aur ebook JPG bhej diye.")
    await _set_offset(ctx, home - timedelta(days=13))
    await delivery.confirm_expired_holds(ctx)

    # Active: Kiln Labs identity, milestone I released, II delivered and in review.
    await _set_offset(ctx, home - timedelta(days=12))
    today = ist_date(ctx.clock.now())
    kiln = {
        "blanks": {
            "maker_name": b("Aditi Rao.", "Aditi Rao"),
            "client_name": b("Rahul Mehta.", "Rahul Mehta"),
            "client_organisation": b("Kiln Labs.", "Kiln Labs"),
            "work": b(
                "Kiln Labs ki brand identity: logo, colour palette, type aur ek page ki guidelines.",
                "Kiln Labs ki brand identity: logo, colour palette, type aur ek page ki guidelines",
            ),
            "revisions": b("Teen.", 3),
            "total": b("Pachees hazaar.", 2_500_000),
            "plan": b(
                "Aadha advance aadha delivery pe.",
                plan_value([("Advance", "advance", 5000, 1_250_000), ("On delivery", "delivery", 5000, 1_250_000)]),
            ),
            "milestones.1.title": b("Advance", "Advance"),
            "milestones.1.deliverables": b("Do logo directions aur mood board.", "Do logo directions aur mood board"),
            "milestones.1.amount": b("Saadhe barah hazaar.", 1_250_000),
            "milestones.1.due": b("Friday tak.", _due(today, 6)),
            "milestones.2.title": b("On delivery", "On delivery"),
            "milestones.2.deliverables": b(
                "Final logo files SVG PNG mein, palette, type, aur guidelines PDF.",
                "Final logo files SVG PNG mein, palette, type, aur guidelines PDF",
            ),
            "milestones.2.amount": b("Saadhe barah hazaar.", 1_250_000),
            "milestones.2.due": b("Do hafte mein, nahi, sixteen din mein.", _due(today, 16)),
            "late_fee.days": b("Paanch din.", 5),
            "late_fee.amount": b("Do hazaar.", 200_000),
            "kill_fee.percent": b("Pachees percent.", 25),
            "ip_transfer.exclusions": b(
                "Drafts aur jo concepts use nahi hue, aur portfolio ka haq.",
                "Drafts aur jo concepts use nahi hue, aur portfolio ka haq",
            ),
        },
        "struck": [],
        "milestone_count": 2,
    }
    deal = await _deed(ctx, aditi, rahul, kiln, publish_to=rahul.email)
    await _pay(ctx, deal.id, rahul)
    deal = await _reload(ctx, deal.id)
    await _set_offset(ctx, home - timedelta(days=9))
    await delivery.deliver(
        ctx, deal.milestones[0].id, aditi, "Dono directions aur mood board Figma mein share kar diye."
    )
    await _set_offset(ctx, home - timedelta(days=8))
    await delivery.approve(ctx, deal.milestones[0].id, rahul)
    await _set_offset(ctx, home - timedelta(days=1))
    await delivery.deliver(ctx, deal.milestones[1].id, aditi, "Final files Drive pe daal di.")

    # Sent and waiting on Rahul: the pitch deck.
    await _set_offset(ctx, home - timedelta(days=1))
    today = ist_date(ctx.clock.now())
    deck = {
        "blanks": {
            "maker_name": b("Aditi Rao.", "Aditi Rao"),
            "client_name": b("Rahul Mehta.", "Rahul Mehta"),
            "client_organisation": b("Kiln Labs.", "Kiln Labs"),
            "work": b(
                "Series A pitch deck ka redesign, chaudah slides.", "Series A pitch deck ka redesign, chaudah slides"
            ),
            "revisions": b("Do.", 2),
            "total": b("Bara hazaar paanch sau.", 1_250_000),
            "plan": b("Poora delivery pe.", plan_value([("On delivery", "delivery", 10_000, 1_250_000)])),
            "milestones.1.title": b("On delivery", "On delivery"),
            "milestones.1.deliverables": b(
                "Keynote aur PDF, speaker notes ke saath.", "Keynote aur PDF, speaker notes ke saath"
            ),
            "milestones.1.amount": b("Bara hazaar paanch sau.", 1_250_000),
            "milestones.1.due": b("Do hafte mein.", _due(today, 14)),
        },
        "struck": ["ip_transfer", "kill_fee", "late_fee"],
        "milestone_count": 1,
    }
    await _deed(ctx, aditi, None, deck, publish_to=rahul.email)

    await _set_offset(ctx, home)
    today = ist_date(ctx.clock.now())
    launch = {
        "blanks": {
            "maker_name": b("Aditi Rao.", "Aditi Rao"),
            "client_name": b("Rahul Mehta.", "Rahul Mehta"),
            "client_organisation": b("Kiln Labs.", "Kiln Labs"),
            "work": b(
                "Instagram launch kit: nau post templates aur teen story templates.",
                "Instagram launch kit: nau post templates aur teen story templates",
            ),
            "revisions": b("Teen.", 3),
            "total": b("Utna hi jitna pichli baar.", None, "failed", AMOUNT_UNREADABLE),
            "plan": b("Baad mein dekhenge.", None, "failed", PLAN_UNREADABLE),
            "milestones.1.title": b("On delivery", "On delivery"),
            "milestones.1.deliverables": b(
                "Canva templates aur export ki hui PNGs.", "Canva templates aur export ki hui PNGs"
            ),
            "milestones.1.due": b("Jaldi.", None, "failed", DATE_UNREADABLE),
        },
        "struck": ["ip_transfer", "kill_fee"],
        "milestone_count": 1,
    }
    await _deed(ctx, aditi, None, launch, publish_to=None)
    await _pump(ctx)
    log.info("seeded personas and four deeds")
    return True


async def _reload(ctx: AppContext, deal_id: uuid.UUID) -> Deal:
    async with ctx.sessions() as session:
        deal = (await session.execute(select(Deal).where(Deal.id == deal_id))).scalar_one()
        await session.refresh(deal, ["milestones"])
        return deal


async def main() -> None:
    logging.basicConfig(level=logging.INFO)
    settings = get_settings()
    if not settings.is_sandbox:
        raise SystemExit("Seeding refuses to run outside dev and demo.")
    ctx = await build_context(settings, pool_size=3)
    try:
        await seed(ctx)
    finally:
        await ctx.engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
