"""Mutual cancellation. Undelivered held money goes back through the refund path; delivered work keeps
its review window; released money is never pulled back."""

import uuid

from sqlalchemy import select

from vaada import register
from vaada.context import AppContext
from vaada.db import transaction
from vaada.email import messages
from vaada.email.outbox import queue_email
from vaada.format import roman, rupees
from vaada.models import Cancellation, Deal, User
from vaada.models.enums import DealStatus, MilestoneStatus, ProposalStatus, RegistryKind, Role
from vaada.money.common import deal_facts, load_deal, maker_id_of, party_emails, require_role
from vaada.money.errors import MoneyError, NotFoundError
from vaada.money.locks import deal_lock
from vaada.money.refunds import RefundIntent, begin, run_refund
from vaada.registry.queue import queue_record

CANCELLABLE = frozenset({DealStatus.ACCEPTED, DealStatus.FUNDED, DealStatus.ACTIVE, DealStatus.DISPUTED})


def kill_fee_percent(deal: Deal, proposed_by: Role) -> int:
    """The kill fee applies when the Client asks to end the deed and the Maker agrees."""
    clause = ((deal.terms or {}).get("kill_fee") or {}) if proposed_by == Role.CLIENT else {}
    return int(clause.get("percent") or 0)


def cancellation_effect(deal: Deal, proposed_by: Role, maker: str, client: str) -> str:
    """One plain sentence on what confirming would do to the money, shown before anyone confirms."""
    percent = kill_fee_percent(deal, proposed_by)
    held = [m for m in deal.milestones if m.status == MilestoneStatus.HELD]
    delivered = [m for m in deal.milestones if m.status in (MilestoneStatus.DELIVERED, MilestoneStatus.DISPUTED)]
    parts: list[str] = []
    if held:
        total = sum(m.amount_paise for m in held)
        if percent:
            kept = sum(m.amount_paise * percent // 100 for m in held)
            parts.append(
                f"{rupees(total - kept)} held for undelivered work goes back to {client}, and {maker} keeps "
                f"{rupees(kept)} as the {percent}% kill fee"
            )
        else:
            parts.append(f"{rupees(total)} held for undelivered work goes back to {client}")
    if delivered:
        names = ", ".join(roman(m.idx) for m in delivered)
        parts.append(f"delivered milestone {names} finishes its review as normal")
    if not held and not delivered:
        parts.append("no money moves; the deed simply ends")
    return "; ".join(parts) + ". Money already released stays released."


async def propose(ctx: AppContext, deal_id: uuid.UUID, actor: User, reason: str) -> Cancellation:
    reason = reason.strip()
    if not reason:
        raise MoneyError("Say why, in a line. The other party will see it.", status_code=422)
    async with transaction(ctx.sessions) as session:
        deal = await load_deal(session, deal_id, lock=True)
        role = require_role(deal, actor.id, Role.MAKER, Role.CLIENT)
        if deal.status not in CANCELLABLE:
            raise MoneyError("This deed can't be cancelled now.")
        open_proposal = (
            await session.execute(
                select(Cancellation).where(
                    Cancellation.deal_id == deal.id, Cancellation.status == ProposalStatus.PROPOSED
                )
            )
        ).scalar_one_or_none()
        if open_proposal is not None:
            raise MoneyError("There's already a cancellation waiting for an answer.")
        now = ctx.clock.now()
        proposal = Cancellation(
            deal_id=deal.id, proposed_by=actor.id, proposed_role=role, reason=reason, created_at=now
        )
        session.add(proposal)
        facts = await deal_facts(session, ctx.settings, deal)
        proposer = facts.maker if role == Role.MAKER else facts.client
        effect = cancellation_effect(deal, role, facts.maker, facts.client)
        await register.log(
            session,
            deal_id=deal.id,
            kind="cancellation_proposed",
            summary=f"{proposer} asked to cancel the rest of the deed: “{reason}”",
            role=role,
            actor_id=actor.id,
            at=now,
            detail={"effect": effect},
        )
        maker_email, client_email = await party_emails(session, deal)
        queue_email(
            session,
            to=client_email if role == Role.MAKER else maker_email,
            template="cancellation_proposed",
            deal_id=deal.id,
            message=messages.cancellation_proposed(facts, proposer=proposer, reason=reason, effect=effect),
        )
        return proposal


async def withdraw(ctx: AppContext, cancellation_id: uuid.UUID, actor: User) -> None:
    async with transaction(ctx.sessions) as session:
        proposal = await session.get(Cancellation, cancellation_id, with_for_update=True)
        if proposal is None or proposal.proposed_by != actor.id:
            raise NotFoundError("That cancellation")
        if proposal.status != ProposalStatus.PROPOSED:
            return
        proposal.status = ProposalStatus.WITHDRAWN
        proposal.responded_at = ctx.clock.now()
        await register.log(
            session,
            deal_id=proposal.deal_id,
            kind="cancellation_withdrawn",
            summary="The request to cancel was withdrawn. The deed carries on.",
            role=proposal.proposed_role,
            actor_id=actor.id,
            at=ctx.clock.now(),
        )


async def respond(ctx: AppContext, cancellation_id: uuid.UUID, actor: User, *, confirm: bool) -> list[str]:
    async with ctx.sessions() as session:
        proposal = await session.get(Cancellation, cancellation_id)
        if proposal is None:
            raise NotFoundError("That cancellation")
        deal_id = proposal.deal_id
    to_refund: list[uuid.UUID] = []
    async with deal_lock(ctx.engine, deal_id):
        async with transaction(ctx.sessions) as session:
            proposal = await session.get(Cancellation, cancellation_id, with_for_update=True)
            assert proposal is not None
            deal = await load_deal(session, deal_id, lock=True)
            role = require_role(deal, actor.id, Role.MAKER, Role.CLIENT)
            if proposal.proposed_by == actor.id:
                raise MoneyError("The other party has to answer this one.")
            if proposal.status != ProposalStatus.PROPOSED:
                return []
            now = ctx.clock.now()
            facts = await deal_facts(session, ctx.settings, deal)
            responder = facts.maker if role == Role.MAKER else facts.client
            proposal.status = ProposalStatus.CONFIRMED if confirm else ProposalStatus.DECLINED
            proposal.responded_by = actor.id
            proposal.responded_at = now
            maker_email, client_email = await party_emails(session, deal)
            proposer_email = maker_email if proposal.proposed_role == Role.MAKER else client_email
            queue_email(
                session,
                to=proposer_email,
                template="cancellation_answered",
                deal_id=deal.id,
                message=messages.cancellation_answered(facts, responder=responder, confirmed=confirm),
            )
            if not confirm:
                await register.log(
                    session,
                    deal_id=deal.id,
                    kind="cancellation_declined",
                    summary=f"{responder} declined to cancel. The deed carries on.",
                    role=role,
                    actor_id=actor.id,
                    at=now,
                )
                return []

            percent = kill_fee_percent(deal, proposal.proposed_role)
            effect = cancellation_effect(deal, proposal.proposed_role, facts.maker, facts.client)
            for m in deal.milestones:
                if m.status == MilestoneStatus.UNFUNDED:
                    m.status = MilestoneStatus.CANCELLED
                elif m.status == MilestoneStatus.HELD:
                    refund_paise = m.amount_paise - m.amount_paise * percent // 100
                    begin(
                        m,
                        RefundIntent(
                            purpose="cancel",
                            refund_paise=refund_paise,
                            final_status=MilestoneStatus.REFUNDED,
                            release_rest=percent > 0,
                            why="Both parties agreed to cancel the rest of the deed."
                            + (f" {facts.maker} keeps a {percent}% kill fee under the deed." if percent else ""),
                        ),
                    )
                    to_refund.append(m.id)
            deal.status = DealStatus.CANCELLED
            deal.cancelled_at = now
            await register.log(
                session,
                deal_id=deal.id,
                kind="cancelled",
                summary=f"{responder} agreed to cancel the rest of the deed. {effect}",
                role=role,
                actor_id=actor.id,
                at=now,
            )
            await queue_record(
                session, ctx.settings, deal=deal, maker_id=await maker_id_of(session, deal), kind=RegistryKind.CANCELLED
            )
        outcomes = [(await run_refund(ctx, deal_id, milestone_id)).message for milestone_id in to_refund]
    await ctx.kick("send_emails")
    return outcomes


async def withdraw_unaccepted(ctx: AppContext, deal_id: uuid.UUID, actor: User) -> None:
    """Before anyone has accepted, the Maker can simply take the deed back."""
    async with transaction(ctx.sessions) as session:
        deal = await load_deal(session, deal_id, lock=True)
        require_role(deal, actor.id, Role.MAKER)
        if deal.status != DealStatus.PUBLISHED:
            raise MoneyError("Only a deed nobody has accepted yet can be withdrawn.")
        now = ctx.clock.now()
        deal.status = DealStatus.CANCELLED
        deal.cancelled_at = now
        for m in deal.milestones:
            m.status = MilestoneStatus.CANCELLED
        await register.log(
            session,
            deal_id=deal.id,
            kind="withdrawn",
            summary="The Maker withdrew the deed before it was accepted.",
            role=Role.MAKER,
            actor_id=actor.id,
            at=now,
        )
        await queue_record(
            session, ctx.settings, deal=deal, maker_id=await maker_id_of(session, deal), kind=RegistryKind.CANCELLED
        )
