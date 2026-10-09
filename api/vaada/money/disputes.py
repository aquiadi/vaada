"""Disputes. Opening one puts the hold back to indefinite; Vaada decides release, refund or split."""

import logging
import uuid
from dataclasses import dataclass

from sqlalchemy import select

from vaada import register
from vaada.context import AppContext
from vaada.db import transaction
from vaada.email import messages
from vaada.email.outbox import queue_email
from vaada.format import ist_moment, roman, rupees
from vaada.models import Dispute, User
from vaada.models.enums import (
    DisputeResolution,
    DisputeStatus,
    FlagKind,
    LedgerKind,
    MilestoneStatus,
    RegistryKind,
    Role,
)
from vaada.money import ledger
from vaada.money.common import (
    apply_status,
    deal_facts,
    load_deal,
    load_milestone,
    maker_id_of,
    milestone_facts,
    party_emails,
    require_role,
)
from vaada.money.errors import GatewayTroubleError, MoneyError, NotFoundError
from vaada.money.flags import raise_flag
from vaada.money.gateway import GatewayError, GatewayUnavailableError
from vaada.money.locks import deal_lock
from vaada.money.refunds import RefundIntent, begin, run_refund
from vaada.registry.queue import queue_record

log = logging.getLogger(__name__)


async def open_dispute(ctx: AppContext, milestone_id: uuid.UUID, actor: User, reason: str) -> Dispute:
    reason = reason.strip()
    if not reason:
        raise MoneyError("Say what's wrong, in a line or two. Both of you will see it.", status_code=422)
    async with ctx.sessions() as session:
        deal_id = (await load_milestone(session, milestone_id)).deal_id
    async with deal_lock(ctx.engine, deal_id):
        async with transaction(ctx.sessions) as session:
            deal = await load_deal(session, deal_id, lock=True)
            role = require_role(deal, actor.id, Role.MAKER, Role.CLIENT)
            milestone = next(m for m in deal.milestones if m.id == milestone_id)
            now = ctx.clock.now()
            if milestone.status == MilestoneStatus.DISPUTED:
                raise MoneyError("There's already a dispute open on this milestone.")
            if milestone.status != MilestoneStatus.DELIVERED or milestone.review_ends_at is None:
                raise MoneyError("A dispute can be raised only on delivered work, during its review window.")
            if now >= milestone.review_ends_at:
                raise MoneyError(
                    f"Disputes for this milestone closed at {ist_moment(milestone.review_ends_at)}. "
                    "Razorpay is releasing the money as the deed says."
                )
            dispute = Dispute(
                milestone_id=milestone.id,
                deal_id=deal.id,
                opened_by=actor.id,
                opened_role=role,
                reason=reason,
                created_at=now,
            )
            session.add(dispute)
            milestone.status = MilestoneStatus.DISPUTED
            apply_status(deal, now)
            facts = await deal_facts(session, ctx.settings, deal)
            opener = facts.maker if role == Role.MAKER else facts.client
            await register.log(
                session,
                deal_id=deal.id,
                milestone_id=milestone.id,
                kind="disputed",
                summary=f"{opener} raised a dispute on milestone {roman(milestone.idx)}: “{reason}” "
                "The money stays held until Vaada decides.",
                role=role,
                actor_id=actor.id,
                at=now,
            )
            await queue_record(
                session,
                ctx.settings,
                deal=deal,
                maker_id=await maker_id_of(session, deal),
                kind=RegistryKind.DISPUTED,
                razorpay_id=milestone.razorpay_transfer_id,
                milestone=milestone,
            )
            message = messages.dispute_opened(facts, milestone_facts(milestone), opener=opener, reason=reason)
            maker_email, client_email = await party_emails(session, deal)
            for to in (maker_email, client_email, *sorted(ctx.settings.admin_email_set)):
                queue_email(session, to=to, template="dispute_opened", deal_id=deal.id, message=message)
        await enforce_hold(ctx, dispute.id)
    return dispute


async def enforce_hold(ctx: AppContext, dispute_id: uuid.UUID) -> bool:
    """Puts the transfer back on hold with no end date. The buffer after the review window exists so this
    reaches Razorpay before the hold would have lifted; if it fails, a job keeps retrying and the admin
    queue shows it in red."""
    async with ctx.sessions() as session:
        dispute = await session.get(Dispute, dispute_id)
        assert dispute is not None
        milestone = await load_milestone(session, dispute.milestone_id)
    if dispute.hold_confirmed_at is not None or dispute.status != DisputeStatus.OPEN:
        return True
    assert milestone.razorpay_transfer_id is not None
    try:
        transfer = await ctx.gateway.set_transfer_hold(milestone.razorpay_transfer_id, on_hold=True, until=None)
    except GatewayError as exc:
        log.error("could not hold transfer for dispute %s: %s", dispute_id, exc)
        async with transaction(ctx.sessions) as session:
            await raise_flag(
                session,
                deal_id=dispute.deal_id,
                milestone_id=milestone.id,
                kind=FlagKind.HOLD_NOT_CONFIRMED,
                summary=f"Dispute on milestone {milestone.idx} is open but Razorpay hasn't confirmed the hold. "
                f"It releases at {ist_moment(milestone.hold_until) if milestone.hold_until else 'unknown'} otherwise.",
                detail={"transfer_id": milestone.razorpay_transfer_id, "error": str(exc)},
                at=ctx.clock.now(),
            )
        return False
    async with transaction(ctx.sessions) as session:
        dispute = await session.get(Dispute, dispute_id, with_for_update=True)
        assert dispute is not None
        now = ctx.clock.now()
        dispute.hold_confirmed_at = now
        stored = await load_milestone(session, milestone.id, lock=True)
        stored.hold_until = None
        await ledger.record(
            session,
            deal_id=dispute.deal_id,
            milestone_id=milestone.id,
            kind=LedgerKind.HOLD_EXTENDED,
            amount_paise=milestone.transfer_paise,
            razorpay_object_id=transfer.id,
            key=f"hold:{transfer.id}:dispute:{dispute.id}",
            at=now,
            note="Held with no end date while the dispute is decided.",
        )
    return True


async def enforce_open_holds(ctx: AppContext) -> int:
    async with ctx.sessions() as session:
        ids = (
            (
                await session.execute(
                    select(Dispute.id).where(Dispute.status == DisputeStatus.OPEN, Dispute.hold_confirmed_at.is_(None))
                )
            )
            .scalars()
            .all()
        )
    confirmed = 0
    for dispute_id in ids:
        async with ctx.sessions() as session:
            dispute = await session.get(Dispute, dispute_id)
            assert dispute is not None
        async with deal_lock(ctx.engine, dispute.deal_id):
            confirmed += int(await enforce_hold(ctx, dispute_id))
    return confirmed


@dataclass(frozen=True)
class Resolution:
    resolution: DisputeResolution
    refund_paise: int
    maker_receives_paise: int
    client_sentence: str
    maker_sentence: str


def plan_resolution(
    milestone_amount: int,
    transfer_paise: int,
    resolution: DisputeResolution,
    refund_paise: int | None,
    maker: str,
    client: str,
) -> Resolution:
    if resolution == DisputeResolution.RELEASE:
        refund = 0
    elif resolution == DisputeResolution.REFUND:
        refund = milestone_amount
    else:
        if refund_paise is None or not 0 < refund_paise < milestone_amount:
            raise MoneyError(
                "A split needs a refund amount above zero and below the milestone's amount.", status_code=422
            )
        refund = refund_paise
    maker_receives = transfer_paise - min(refund, transfer_paise)
    client_sentence = f"{client} gets back {rupees(refund)}." if refund else f"{client} gets nothing back."
    maker_sentence = (
        f"{maker} receives {rupees(maker_receives)} on the next settlement."
        if maker_receives
        else f"{maker} receives nothing for this milestone."
    )
    return Resolution(resolution, refund, maker_receives, client_sentence, maker_sentence)


async def preview(
    ctx: AppContext, dispute_id: uuid.UUID, resolution: DisputeResolution, refund_paise: int | None
) -> Resolution:
    async with ctx.sessions() as session:
        dispute = await session.get(Dispute, dispute_id)
        if dispute is None:
            raise NotFoundError("That dispute")
        milestone = await load_milestone(session, dispute.milestone_id)
        deal = await load_deal(session, dispute.deal_id)
        facts = await deal_facts(session, ctx.settings, deal)
    return plan_resolution(
        milestone.amount_paise,
        milestone.transfer_paise,
        resolution,
        refund_paise,
        facts.maker,
        facts.client,
    )


async def resolve(
    ctx: AppContext,
    dispute_id: uuid.UUID,
    admin: User,
    resolution: DisputeResolution,
    refund_paise: int | None,
    note: str,
) -> Resolution:
    note = note.strip()
    if not note:
        raise MoneyError("Write a note for both parties explaining the decision.", status_code=422)
    planned = await preview(ctx, dispute_id, resolution, refund_paise)
    async with ctx.sessions() as session:
        dispute = await session.get(Dispute, dispute_id)
        assert dispute is not None
    async with deal_lock(ctx.engine, dispute.deal_id):
        async with transaction(ctx.sessions) as session:
            dispute = await session.get(Dispute, dispute_id, with_for_update=True)
            assert dispute is not None
            if dispute.status != DisputeStatus.OPEN:
                raise MoneyError("This dispute is already decided.")
            milestone = await load_milestone(session, dispute.milestone_id, lock=True)
            if planned.refund_paise > 0:
                begin(
                    milestone,
                    RefundIntent(
                        purpose="dispute",
                        refund_paise=planned.refund_paise,
                        final_status=MilestoneStatus.RESOLVED,
                        release_rest=planned.maker_receives_paise > 0,
                        why=f"Vaada decided the dispute: {note}",
                    ),
                )
        if planned.refund_paise > 0:
            outcome = await run_refund(ctx, dispute.deal_id, milestone.id)
            if not outcome.completed:
                raise MoneyError(outcome.message, status_code=502, code="refund_stuck")
        else:
            assert milestone.razorpay_transfer_id is not None
            try:
                transfer = await ctx.gateway.set_transfer_hold(
                    milestone.razorpay_transfer_id, on_hold=False, until=None
                )
            except GatewayUnavailableError as exc:
                raise GatewayTroubleError() from exc
            except GatewayError as exc:
                raise MoneyError(f"Razorpay wouldn't release the money: {exc}", status_code=502) from exc
            async with transaction(ctx.sessions) as session:
                stored = await load_milestone(session, milestone.id, lock=True)
                now = ctx.clock.now()
                stored.status = MilestoneStatus.RESOLVED
                stored.released_at = now
                await ledger.record(
                    session,
                    deal_id=dispute.deal_id,
                    milestone_id=stored.id,
                    kind=LedgerKind.RELEASED,
                    amount_paise=stored.transfer_paise,
                    razorpay_object_id=transfer.id,
                    key=f"released:{transfer.id}",
                    at=now,
                    note="Released after Vaada decided the dispute.",
                )
        async with transaction(ctx.sessions) as session:
            dispute = await session.get(Dispute, dispute_id, with_for_update=True)
            assert dispute is not None
            deal = await load_deal(session, dispute.deal_id, lock=True)
            stored = next(m for m in deal.milestones if m.id == dispute.milestone_id)
            now = ctx.clock.now()
            dispute.status = DisputeStatus.RESOLVED
            dispute.resolution = resolution
            dispute.refund_paise = planned.refund_paise
            dispute.release_paise = planned.maker_receives_paise
            dispute.resolved_by = admin.id
            dispute.notes = note
            dispute.resolved_at = now
            apply_status(deal, now)
            outcome_text = f"{planned.client_sentence} {planned.maker_sentence}"
            await register.log(
                session,
                deal_id=deal.id,
                milestone_id=stored.id,
                kind="dispute_resolved",
                summary=f"Vaada decided the dispute on milestone {roman(stored.idx)}. {outcome_text} Note: “{note}”",
                role=Role.ADMIN,
                actor_id=admin.id,
                at=now,
            )
            await queue_record(
                session,
                ctx.settings,
                deal=deal,
                maker_id=await maker_id_of(session, deal),
                kind=RegistryKind.RESOLVED,
                razorpay_id=stored.razorpay_transfer_id,
                milestone=stored,
            )
            facts = await deal_facts(session, ctx.settings, deal)
            message = messages.dispute_resolved(facts, milestone_facts(stored), outcome=outcome_text, note=note)
            maker_email, client_email = await party_emails(session, deal)
            for to in (maker_email, client_email):
                queue_email(session, to=to, template="dispute_resolved", deal_id=deal.id, message=message)
    return planned
