"""What the web app receives. Every action comes with the sentence that says exactly what it will do."""

import json
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from vaada.context import AppContext
from vaada.format import ist_day, ist_moment, mask_email, roman, rupees
from vaada.models import (
    Acceptance,
    Cancellation,
    DateChange,
    Deal,
    DealEvent,
    Dispute,
    Milestone,
    Payment,
    PayoutAccount,
    RegistryRecord,
    User,
    VoiceUpdate,
)
from vaada.models.enums import (
    DealStatus,
    DisputeStatus,
    MilestoneStatus,
    PaymentStatus,
    ProposalStatus,
    RegistryStatus,
    Role,
)
from vaada.money.cancellation import CANCELLABLE, cancellation_effect
from vaada.money.common import role_of


def iso(moment: datetime | None) -> str | None:
    return moment.isoformat() if moment else None


def tx_url(ctx: AppContext, tx_hash: str | None) -> str | None:
    if not tx_hash or not ctx.settings.chain_explorer_tx_url:
        return None
    return ctx.settings.chain_explorer_tx_url.rstrip("/") + "/" + tx_hash


def registry_view(ctx: AppContext, record: RegistryRecord, milestone_idx: int | None) -> dict[str, Any]:
    return {
        "kind": record.kind.value,
        "status": record.status.value,
        "tx_hash": record.tx_hash,
        "tx_url": tx_url(ctx, record.tx_hash),
        "milestone_idx": milestone_idx,
        "created_at": iso(record.created_at),
        "confirmed_at": iso(record.confirmed_at),
    }


def possessive(name: str) -> str:
    return f"{name}'" if name.endswith("s") else f"{name}'s"


def first_name(name: str) -> str:
    return name.split()[0] if name else name


def milestone_actions(
    ctx: AppContext, deal: Deal, m: Milestone, role: Role | None, *, maker: str, client: str, bank_last4: str | None
) -> list[dict[str, str]]:
    now = ctx.clock.now()
    s = ctx.settings
    account = f"bank account ending {bank_last4}" if bank_last4 else "bank account"
    live = deal.status not in (DealStatus.CANCELLED, DealStatus.LAPSED)
    actions: list[dict[str, str]] = []
    amount = rupees(m.amount_paise)
    to_maker = rupees(m.transfer_paise) + (
        f" (the {amount} part less Vaada's fee and any tax withheld)" if m.transfer_paise != m.amount_paise else ""
    )
    if role == Role.MAKER and m.status == MilestoneStatus.HELD and live:
        review_ends = now + timedelta(days=s.review_window_days)
        release = review_ends + timedelta(hours=s.hold_buffer_hours)
        actions.append(
            {
                "action": "deliver",
                "label": "Mark delivered",
                "effect": f"This tells {first_name(client)} that milestone {roman(m.idx)} is delivered. "
                f"They can raise a problem until about {ist_moment(review_ends)}; if they don't, Razorpay releases "
                f"{rupees(m.transfer_paise)} on about {ist_moment(release)}, "
                f"for its next settlement to your {account}.",
            }
        )
    if role == Role.CLIENT and m.status == MilestoneStatus.DELIVERED:
        actions.append(
            {
                "action": "approve",
                "label": "Approve and release",
                "effect": f"This releases {to_maker} to {possessive(first_name(maker))} {account} on the next "
                "settlement. It can't be undone.",
            }
        )
    if (
        role in (Role.MAKER, Role.CLIENT)
        and m.status == MilestoneStatus.DELIVERED
        and m.review_ends_at
        and now < m.review_ends_at
    ):
        actions.append(
            {
                "action": "dispute",
                "label": "Raise a problem",
                "effect": f"This keeps {amount} held until Vaada decides. Both of you see your reason. "
                f"You can raise a problem until {ist_moment(m.review_ends_at)}.",
            }
        )
    refund_opens = m.due_at + timedelta(days=s.grace_days)
    if role == Role.CLIENT and m.status == MilestoneStatus.HELD and now >= refund_opens:
        actions.append(
            {
                "action": "refund",
                "label": "Ask for this money back",
                "effect": f"Milestone {roman(m.idx)} wasn't delivered within {s.grace_days} days of its due date. This "
                f"asks Razorpay to return {amount} to you."
                + (" The processing fee isn't refunded." if deal.client_fee_paise else ""),
            }
        )
    if role == Role.CLIENT and m.status == MilestoneStatus.REFUND_REQUESTED:
        actions.append(
            {
                "action": "refund",
                "label": "Try the refund again",
                "effect": f"This asks Razorpay again to return {amount} to you.",
            }
        )
    if (
        role in (Role.MAKER, Role.CLIENT)
        and m.status in (MilestoneStatus.HELD, MilestoneStatus.UNFUNDED)
        and live
        and deal.status != DealStatus.PUBLISHED
    ):
        actions.append(
            {
                "action": "propose_date",
                "label": "Ask to move this date",
                "effect": "The date only changes if the other party agrees.",
            }
        )
    return actions


async def _names(session: AsyncSession, deal: Deal) -> tuple[str, str, User | None]:
    terms = deal.terms or {}
    maker = await session.get(User, deal.freelancer_id)
    draft_blanks = (deal.draft or {}).get("blanks", {})
    maker_name = terms.get("maker_name") or (maker.display_name if maker else None) or "The Maker"
    client_name = terms.get("client_name") or (draft_blanks.get("client_name") or {}).get("value") or "the Client"
    return maker_name, client_name, maker


async def deal_room(ctx: AppContext, deal: Deal, viewer: User) -> dict[str, Any]:
    async with ctx.sessions() as session:
        role = role_of(deal, viewer.id)
        maker_name, client_name, maker = await _names(session, deal)
        payout = (
            await session.execute(select(PayoutAccount).where(PayoutAccount.user_id == deal.freelancer_id))
        ).scalar_one_or_none()
        bank_last4 = payout.bank_last4 if payout else None
        acceptance = (
            await session.execute(select(Acceptance).where(Acceptance.deal_id == deal.id))
        ).scalar_one_or_none()
        payment = (
            await session.execute(
                select(Payment).where(Payment.deal_id == deal.id).order_by(Payment.created_at.desc()).limit(1)
            )
        ).scalar_one_or_none()
        events = (
            (await session.execute(select(DealEvent).where(DealEvent.deal_id == deal.id).order_by(DealEvent.id)))
            .scalars()
            .all()
        )
        records = (
            (
                await session.execute(
                    select(RegistryRecord).where(RegistryRecord.deal_id == deal.id).order_by(RegistryRecord.created_at)
                )
            )
            .scalars()
            .all()
        )
        cancellations = (
            (
                await session.execute(
                    select(Cancellation).where(Cancellation.deal_id == deal.id).order_by(Cancellation.created_at)
                )
            )
            .scalars()
            .all()
        )
        date_changes = (
            (
                await session.execute(
                    select(DateChange).where(DateChange.deal_id == deal.id).order_by(DateChange.created_at)
                )
            )
            .scalars()
            .all()
        )
        disputes = (
            (await session.execute(select(Dispute).where(Dispute.deal_id == deal.id).order_by(Dispute.created_at)))
            .scalars()
            .all()
        )
        voice = (
            (
                await session.execute(
                    select(VoiceUpdate)
                    .where(VoiceUpdate.deal_id == deal.id, VoiceUpdate.user_id == viewer.id)
                    .order_by(VoiceUpdate.created_at.desc())
                    .limit(20)
                )
            )
            .scalars()
            .all()
        )

    idx_of = {m.id: m.idx for m in deal.milestones}
    now = ctx.clock.now()
    milestones = []
    for m in deal.milestones:
        milestones.append(
            {
                "id": str(m.id),
                "idx": m.idx,
                "title": m.title,
                "deliverables": m.deliverables,
                "amount_paise": m.amount_paise,
                "transfer_paise": m.transfer_paise,
                "due_at": iso(m.due_at),
                "status": m.status.value,
                "delivered_at": iso(m.delivered_at),
                "delivery_note": m.delivery_note,
                "review_ends_at": iso(m.review_ends_at),
                "hold_until": iso(m.hold_until),
                "released_at": iso(m.released_at),
                "refunded_at": iso(m.refunded_at),
                "refund_paise": m.refund_paise,
                "refund_opens_at": iso(m.due_at + timedelta(days=ctx.settings.grace_days)),
                "revisions_logged": m.revisions_logged,
                "registry": [registry_view(ctx, r, m.idx) for r in records if r.milestone_id == m.id],
                "actions": milestone_actions(
                    ctx, deal, m, role, maker=maker_name, client=client_name, bank_last4=bank_last4
                ),
            }
        )

    actions: list[dict[str, str]] = []
    open_cancellation = next((c for c in cancellations if c.status == ProposalStatus.PROPOSED), None)
    if role in (Role.MAKER, Role.CLIENT) and deal.status in CANCELLABLE and open_cancellation is None:
        effect = cancellation_effect(deal, role, maker_name, client_name)
        actions.append(
            {
                "action": "propose_cancellation",
                "label": "Propose cancelling the rest",
                "effect": f"If {first_name(client_name if role == Role.MAKER else maker_name)} agrees: {effect}",
            }
        )
    if role == Role.MAKER and deal.status == DealStatus.PUBLISHED:
        actions.append(
            {
                "action": "withdraw",
                "label": "Withdraw this deed",
                "effect": "The link stops working for acceptance. Nothing has been paid, so no money moves.",
            }
        )
        actions.append(
            {
                "action": "resend",
                "label": "Send it again",
                "effect": "Sends the link again, to the same or a corrected address.",
            }
        )
    if (
        role == Role.MAKER
        and deal.status in (DealStatus.LAPSED, DealStatus.CANCELLED)
        and not any(m.status in (MilestoneStatus.RELEASED, MilestoneStatus.REFUNDED) for m in deal.milestones)
    ):
        actions.append(
            {
                "action": "reissue",
                "label": "Re-issue with new dates",
                "effect": "Starts a new draft with the same words and amounts. You'll set the dates again.",
            }
        )
    if role == Role.CLIENT and deal.status == DealStatus.ACCEPTED:
        actions.append(
            {
                "action": "pay",
                "label": "Pay now",
                "effect": f"You pay {rupees((deal.total_paise or 0) + deal.client_fee_paise)}"
                + (", including the non-refundable processing fee." if deal.client_fee_paise else "."),
            }
        )

    terms = deal.terms or {}
    revisions = terms.get("revisions")
    return {
        "id": str(deal.id),
        "slug": deal.slug,
        "deed_no": deal.deed_no,
        "status": deal.status.value,
        "title": deal.title,
        "role": role.value if role else None,
        "maker": {
            "name": maker_name,
            "handle": maker.handle if maker else None,
            "maker_id": maker.maker_id if maker else None,
        },
        "client": {"name": client_name, "email_masked": mask_email(deal.client_email) if deal.client_email else None},
        "draft": deal.draft if role == Role.MAKER and deal.status == DealStatus.DRAFT else None,
        "draft_version": deal.draft_version,
        "agreement": json.loads(deal.agreement_canonical) if deal.agreement_canonical else None,
        "agreement_hash": deal.agreement_hash,
        "agreement_nonce": deal.agreement_nonce,
        "struck_clauses": deal.struck_clauses,
        "published_at": iso(deal.published_at),
        "accepted": (
            {
                "name": acceptance.name_typed,
                "email_masked": mask_email(acceptance.email),
                "at": iso(acceptance.accepted_at),
            }
            if acceptance
            else None
        ),
        "pay_by": iso(deal.pay_by),
        "accept_until": iso(min((m.due_at for m in deal.milestones), default=None)),
        "money": {
            "total_paise": deal.total_paise,
            "client_fee_paise": deal.client_fee_paise,
            "order_paise": (deal.total_paise or 0) + deal.client_fee_paise,
            "platform_fee_paise": deal.platform_fee_paise,
            "transfers_paise": sum(m.transfer_paise for m in deal.milestones),
        },
        "payment": (
            {
                "status": payment.status.value,
                "method": payment.method,
                "captured_at": iso(payment.captured_at),
                "refund_deadline": iso(payment.captured_at + timedelta(days=ctx.settings.refund_limit_days))
                if payment.captured_at
                else None,
            }
            if payment
            else None
        ),
        "bank_last4": bank_last4 if role == Role.MAKER else None,
        "revisions_allowed": revisions,
        "revisions_logged": sum(m.revisions_logged for m in deal.milestones),
        "milestones": milestones,
        "actions": actions,
        "events": [
            {
                "at": iso(e.created_at),
                "kind": e.kind,
                "summary": e.summary,
                "role": e.actor_role.value,
                "milestone_idx": idx_of.get(e.milestone_id) if e.milestone_id else None,
            }
            for e in events
        ],
        "registry": [registry_view(ctx, r, idx_of.get(r.milestone_id) if r.milestone_id else None) for r in records],
        "cancellations": [
            {
                "id": str(c.id),
                "status": c.status.value,
                "proposed_role": c.proposed_role.value,
                "reason": c.reason,
                "created_at": iso(c.created_at),
                "effect": cancellation_effect(deal, c.proposed_role, maker_name, client_name)
                if c.status == ProposalStatus.PROPOSED
                else None,
                "can_respond": c.status == ProposalStatus.PROPOSED and role is not None and c.proposed_by != viewer.id,
                "can_withdraw": c.status == ProposalStatus.PROPOSED and c.proposed_by == viewer.id,
            }
            for c in cancellations
        ],
        "date_changes": [
            {
                "id": str(d.id),
                "milestone_idx": idx_of.get(d.milestone_id),
                "old_due_at": iso(d.old_due_at),
                "new_due_at": iso(d.new_due_at),
                "reason": d.reason,
                "status": d.status.value,
                "proposed_role": d.proposed_role.value,
                "can_respond": d.status == ProposalStatus.PROPOSED and role is not None and d.proposed_by != viewer.id,
            }
            for d in date_changes
        ],
        "disputes": [
            {
                "id": str(d.id),
                "milestone_idx": idx_of.get(d.milestone_id),
                "status": d.status.value,
                "reason": d.reason,
                "opened_role": d.opened_role.value,
                "resolution": d.resolution.value if d.resolution else None,
                "refund_paise": d.refund_paise,
                "release_paise": d.release_paise,
                "notes": d.notes,
                "created_at": iso(d.created_at),
                "resolved_at": iso(d.resolved_at),
                "hold_confirmed": d.hold_confirmed_at is not None or d.status != DisputeStatus.OPEN,
            }
            for d in disputes
        ],
        "voice_updates": [
            {
                "id": str(v.id),
                "raw_text": v.raw_text,
                "proposed_actions": v.proposed_actions,
                "status": v.status.value,
                "created_at": iso(v.created_at),
                "mine": v.user_id == viewer.id,
            }
            for v in voice
        ],
        "now": iso(now),
    }


async def public_deed(ctx: AppContext, deal: Deal, viewer: User | None) -> dict[str, Any]:
    """The client's view, readable without signing in. No ledger, no register, no emails in full."""
    async with ctx.sessions() as session:
        maker_name, client_name, maker = await _names(session, deal)
        acceptance = (
            await session.execute(select(Acceptance).where(Acceptance.deal_id == deal.id))
        ).scalar_one_or_none()
        records = (
            (
                await session.execute(
                    select(RegistryRecord).where(RegistryRecord.deal_id == deal.id).order_by(RegistryRecord.created_at)
                )
            )
            .scalars()
            .all()
        )
        captured = (
            await session.execute(
                select(Payment.id).where(Payment.deal_id == deal.id, Payment.status == PaymentStatus.CAPTURED)
            )
        ).first()
    order_paise = (deal.total_paise or 0) + deal.client_fee_paise
    idx_of = {m.id: m.idx for m in deal.milestones}
    role = role_of(deal, viewer.id) if viewer else None
    return {
        "slug": deal.slug,
        "deal_id": str(deal.id) if role else None,
        "deed_no": deal.deed_no,
        "status": deal.status.value,
        "title": deal.title,
        "viewer_role": role.value if role else None,
        "maker": {
            "name": maker_name,
            "handle": maker.handle if maker else None,
            "maker_id": maker.maker_id if maker else None,
        },
        "client": {"name": client_name},
        "agreement": json.loads(deal.agreement_canonical) if deal.agreement_canonical else None,
        "agreement_hash": deal.agreement_hash,
        "agreement_nonce": deal.agreement_nonce,
        "struck_clauses": deal.struck_clauses,
        "fees": {
            "total_paise": deal.total_paise,
            "client_fee_paise": deal.client_fee_paise,
            "order_paise": order_paise,
            "upi_allowed": order_paise <= ctx.settings.upi_limit_paise,
        },
        "accept_until": iso(min((m.due_at for m in deal.milestones), default=None)),
        "accept_until_day": ist_day(min(m.due_at for m in deal.milestones)) if deal.milestones else None,
        "pay_by": iso(deal.pay_by),
        "accepted": (
            {
                "name": acceptance.name_typed,
                "email_masked": mask_email(acceptance.email),
                "at": iso(acceptance.accepted_at),
            }
            if acceptance
            else None
        ),
        "paid": captured is not None,
        "milestones": [
            {
                "idx": m.idx,
                "title": m.title,
                "amount_paise": m.amount_paise,
                "status": m.status.value,
                "due_at": iso(m.due_at),
            }
            for m in deal.milestones
        ],
        "registry": [registry_view(ctx, r, idx_of.get(r.milestone_id) if r.milestone_id else None) for r in records],
        "registry_pending": any(r.status in (RegistryStatus.QUEUED, RegistryStatus.SENT) for r in records),
    }
