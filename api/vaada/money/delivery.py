"""Delivery, approval and the auto-release that Razorpay enforces when the review window ends."""

import logging
import uuid
from datetime import timedelta

from sqlalchemy import select

from vaada import register
from vaada.context import AppContext
from vaada.db import transaction
from vaada.email import messages
from vaada.email.outbox import queue_email
from vaada.format import ist_moment, roman, rupees
from vaada.models import Milestone, User
from vaada.models.enums import DealStatus, FlagKind, LedgerKind, MilestoneStatus, RegistryKind, Role
from vaada.money import ledger
from vaada.money.common import (
    apply_status,
    deal_facts,
    load_deal,
    load_milestone,
    maker_id_of,
    milestone_facts,
    party_emails,
    payout_account_of,
    require_role,
)
from vaada.money.entities import to_unix
from vaada.money.errors import GatewayTroubleError, MoneyError
from vaada.money.flags import raise_flag
from vaada.money.gateway import GatewayError, GatewayRejectedError, GatewayUnavailableError, Transfer
from vaada.money.locks import deal_lock
from vaada.registry.queue import queue_record

log = logging.getLogger(__name__)


async def _deal_id_of(ctx: AppContext, milestone_id: uuid.UUID) -> uuid.UUID:
    async with ctx.sessions() as session:
        return (await load_milestone(session, milestone_id)).deal_id


async def deliver(ctx: AppContext, milestone_id: uuid.UUID, actor: User, note: str | None) -> Milestone:
    deal_id = await _deal_id_of(ctx, milestone_id)
    async with deal_lock(ctx.engine, deal_id):
        async with ctx.sessions() as session:
            deal = await load_deal(session, deal_id)
            require_role(deal, actor.id, Role.MAKER)
            milestone = await load_milestone(session, milestone_id)
        if milestone.status == MilestoneStatus.DELIVERED:
            return milestone
        if milestone.status != MilestoneStatus.HELD or not milestone.razorpay_transfer_id:
            raise MoneyError("Only a milestone whose money is held can be marked delivered.")
        now = ctx.clock.now()
        review_ends = now + timedelta(days=ctx.settings.review_window_days)
        hold_until = review_ends + timedelta(hours=ctx.settings.hold_buffer_hours)
        try:
            transfer = await ctx.gateway.set_transfer_hold(
                milestone.razorpay_transfer_id, on_hold=True, until=hold_until
            )
        except GatewayUnavailableError as exc:
            raise GatewayTroubleError() from exc
        except GatewayRejectedError as exc:
            raise MoneyError(
                f"Razorpay wouldn't set the release date: {exc}. Nothing has changed.", status_code=502
            ) from exc
        if transfer.on_hold_until is None or to_unix(transfer.on_hold_until) != to_unix(hold_until):
            raise MoneyError(
                "Razorpay didn't confirm the release date, so nothing has changed. Try again.", status_code=502
            )

        async with transaction(ctx.sessions) as session:
            deal = await load_deal(session, deal_id, lock=True)
            milestone = next(m for m in deal.milestones if m.id == milestone_id)
            milestone.status = MilestoneStatus.DELIVERED
            milestone.delivered_at = now
            milestone.delivery_note = (note or "").strip() or None
            milestone.review_ends_at = review_ends
            milestone.hold_until = hold_until
            await ledger.record(
                session,
                deal_id=deal.id,
                milestone_id=milestone.id,
                kind=LedgerKind.HOLD_EXTENDED,
                amount_paise=milestone.transfer_paise,
                razorpay_object_id=transfer.id,
                key=f"hold:{transfer.id}:{to_unix(hold_until)}",
                at=now,
                note=f"Delivered. Razorpay releases this on {ist_moment(hold_until)} unless a dispute is raised.",
            )
            apply_status(deal, now)
            await register.log(
                session,
                deal_id=deal.id,
                milestone_id=milestone.id,
                kind="delivered",
                summary=f"Milestone {roman(milestone.idx)} delivered. Disputes close {ist_moment(review_ends)}; "
                f"the money releases {ist_moment(hold_until)}.",
                role=Role.MAKER,
                actor_id=actor.id,
                at=now,
                detail={"note": milestone.delivery_note} if milestone.delivery_note else None,
            )
            await queue_record(
                session,
                ctx.settings,
                deal=deal,
                maker_id=await maker_id_of(session, deal),
                kind=RegistryKind.DELIVERED,
                razorpay_id=transfer.id,
                milestone=milestone,
            )
            facts = await deal_facts(session, ctx.settings, deal)
            _, client_email = await party_emails(session, deal)
            queue_email(
                session,
                to=client_email,
                template="milestone_delivered",
                deal_id=deal.id,
                message=messages.milestone_delivered(
                    facts,
                    milestone_facts(milestone),
                    review_ends_at=review_ends,
                    hold_until=hold_until,
                    note=milestone.delivery_note,
                ),
            )
            return milestone


async def approve(ctx: AppContext, milestone_id: uuid.UUID, actor: User) -> Milestone:
    deal_id = await _deal_id_of(ctx, milestone_id)
    async with deal_lock(ctx.engine, deal_id):
        async with ctx.sessions() as session:
            deal = await load_deal(session, deal_id)
            require_role(deal, actor.id, Role.CLIENT)
            milestone = await load_milestone(session, milestone_id)
        if milestone.status == MilestoneStatus.RELEASED:
            return milestone
        if milestone.status != MilestoneStatus.DELIVERED or not milestone.razorpay_transfer_id:
            raise MoneyError("Only a delivered milestone can be approved.")
        try:
            transfer = await ctx.gateway.set_transfer_hold(milestone.razorpay_transfer_id, on_hold=False, until=None)
        except GatewayUnavailableError as exc:
            raise GatewayTroubleError() from exc
        except GatewayRejectedError as exc:
            raise MoneyError(
                f"Razorpay wouldn't release the money: {exc}. Nothing has changed.", status_code=502
            ) from exc
        if transfer.on_hold:
            raise MoneyError("Razorpay didn't confirm the release, so nothing has changed. Try again.", status_code=502)
        return await _record_release(
            ctx,
            deal_id,
            milestone_id,
            transfer,
            actor=actor,
            why=f"{{client}} approved milestone {roman(milestone.idx)}.",
        )


async def _record_release(
    ctx: AppContext, deal_id: uuid.UUID, milestone_id: uuid.UUID, transfer: Transfer, *, actor: User | None, why: str
) -> Milestone:
    async with transaction(ctx.sessions) as session:
        deal = await load_deal(session, deal_id, lock=True)
        milestone = next(m for m in deal.milestones if m.id == milestone_id)
        if milestone.status == MilestoneStatus.RELEASED:
            return milestone
        now = ctx.clock.now()
        released_at = min(now, milestone.hold_until) if actor is None and milestone.hold_until else now
        milestone.status = MilestoneStatus.RELEASED
        milestone.released_at = released_at
        await ledger.record(
            session,
            deal_id=deal.id,
            milestone_id=milestone.id,
            kind=LedgerKind.RELEASED,
            amount_paise=milestone.transfer_paise,
            razorpay_object_id=transfer.id,
            key=f"released:{transfer.id}",
            at=now,
            note="Released. Goes to the Maker's bank account on the next settlement.",
        )
        apply_status(deal, now)
        facts = await deal_facts(session, ctx.settings, deal)
        reason = why.format(client=facts.client, maker=facts.maker)
        await register.log(
            session,
            deal_id=deal.id,
            milestone_id=milestone.id,
            kind="released",
            summary=f"{reason} {rupees(milestone.transfer_paise)} released to {facts.maker}, "
            "queued for the next settlement.",
            role=Role.CLIENT if actor else Role.SYSTEM,
            actor_id=actor.id if actor else None,
            at=now,
        )
        await queue_record(
            session,
            ctx.settings,
            deal=deal,
            maker_id=await maker_id_of(session, deal),
            kind=RegistryKind.RELEASED,
            razorpay_id=transfer.id,
            milestone=milestone,
        )
        payout = await payout_account_of(session, deal.freelancer_id)
        maker_email, client_email = await party_emails(session, deal)
        for role, to in (("maker", maker_email), ("client", client_email)):
            queue_email(
                session,
                to=to,
                template="milestone_released",
                deal_id=deal.id,
                message=messages.milestone_released(
                    facts,
                    milestone_facts(milestone),
                    role=role,
                    why=reason,
                    bank_last4=payout.bank_last4 if payout else None,
                ),
            )
        return milestone


async def confirm_expired_holds(ctx: AppContext) -> int:
    """Razorpay lifts the hold by itself when on_hold_until passes; we only find out by asking.
    A release is recorded only when Razorpay's own answer says the hold has lifted."""
    now = ctx.clock.now()
    async with ctx.sessions() as session:
        due = (
            await session.execute(
                select(Milestone.id, Milestone.deal_id).where(
                    Milestone.status == MilestoneStatus.DELIVERED,
                    Milestone.hold_until.is_not(None),
                    Milestone.hold_until <= now,
                )
            )
        ).all()
    released = 0
    for milestone_id, deal_id in due:
        async with deal_lock(ctx.engine, deal_id):
            async with ctx.sessions() as session:
                milestone = await load_milestone(session, milestone_id)
            if milestone.status != MilestoneStatus.DELIVERED or not milestone.razorpay_transfer_id:
                continue
            try:
                transfer = await ctx.gateway.fetch_transfer(milestone.razorpay_transfer_id)
            except GatewayError as exc:
                log.warning("could not confirm hold expiry for %s: %s", milestone_id, exc)
                continue
            if not transfer.hold_lifted(ctx.clock.now()):
                async with transaction(ctx.sessions) as session:
                    await raise_flag(
                        session,
                        deal_id=deal_id,
                        milestone_id=milestone_id,
                        kind=FlagKind.DRIFT,
                        summary=f"Milestone {milestone.idx}'s release time has passed but Razorpay still shows the "
                        "transfer on hold.",
                        detail={"transfer_id": transfer.id, "on_hold_until": str(transfer.on_hold_until)},
                        at=ctx.clock.now(),
                    )
                continue
            await _record_release(
                ctx,
                deal_id,
                milestone_id,
                transfer,
                actor=None,
                why=f"The review window for milestone {roman(milestone.idx)} ended without a dispute, "
                "and Razorpay lifted the hold.",
            )
            released += 1
    return released


async def send_review_reminders(ctx: AppContext) -> int:
    now = ctx.clock.now()
    async with transaction(ctx.sessions) as session:
        rows = (
            (
                await session.execute(
                    select(Milestone)
                    .where(
                        Milestone.status == MilestoneStatus.DELIVERED,
                        Milestone.reminder_sent_at.is_(None),
                        Milestone.review_ends_at.is_not(None),
                        Milestone.review_ends_at <= now + timedelta(hours=24),
                        Milestone.review_ends_at > now,
                    )
                    .with_for_update(skip_locked=True)
                )
            )
            .scalars()
            .all()
        )
        for milestone in rows:
            deal = await load_deal(session, milestone.deal_id)
            if deal.status == DealStatus.CANCELLED and milestone.status != MilestoneStatus.DELIVERED:
                continue
            milestone.reminder_sent_at = now
            facts = await deal_facts(session, ctx.settings, deal)
            _, client_email = await party_emails(session, deal)
            queue_email(
                session,
                to=client_email,
                template="review_closing",
                deal_id=deal.id,
                message=messages.review_closing(
                    facts,
                    milestone_facts(milestone),
                    review_ends_at=milestone.review_ends_at,  # type: ignore[arg-type]
                    hold_until=milestone.hold_until,  # type: ignore[arg-type]
                ),
            )
        return len(rows)
