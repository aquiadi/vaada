"""Money going back to the client: reverse the milestone's transfer, then refund the payment.

Both steps carry idempotency keys built from our ids, so running the whole thing again after a crash,
a timeout or a double click finds the same reversal and the same refund instead of making new ones.
If the second step fails, the milestone stays `refund_requested` and the admin queue shows it.
"""

import logging
import uuid
from dataclasses import dataclass
from datetime import timedelta
from typing import Any

import sentry_sdk
from sqlalchemy import select, update

from vaada import register
from vaada.context import AppContext
from vaada.db import transaction
from vaada.email import messages
from vaada.email.outbox import queue_email
from vaada.format import ist_day, roman, rupees
from vaada.models import Milestone, ReconciliationFlag, User
from vaada.models.enums import FlagKind, LedgerKind, MilestoneStatus, RegistryKind, Role
from vaada.money import ledger
from vaada.money.common import (
    apply_status,
    deal_facts,
    load_deal,
    load_milestone,
    maker_id_of,
    milestone_facts,
    party_emails,
    require_captured_payment,
    require_role,
)
from vaada.money.errors import MoneyError
from vaada.money.flags import raise_flag
from vaada.money.gateway import GatewayError, Refund
from vaada.money.locks import deal_lock
from vaada.registry.queue import queue_record

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class RefundIntent:
    """What we set out to do, saved before the first call so a retry repeats exactly the same calls."""

    purpose: str
    refund_paise: int
    final_status: MilestoneStatus
    release_rest: bool
    why: str
    attempt: int = 0

    def as_json(self) -> dict[str, Any]:
        return {
            "purpose": self.purpose,
            "refund_paise": self.refund_paise,
            "final_status": self.final_status.value,
            "release_rest": self.release_rest,
            "why": self.why,
            "attempt": self.attempt,
        }

    @property
    def refund_key_suffix(self) -> str:
        """A refund Razorpay reports as failed is final for its key, so a new attempt needs a new key."""
        return f"-{self.attempt}" if self.attempt else ""

    @classmethod
    def from_json(cls, data: dict[str, Any]) -> "RefundIntent":
        return cls(
            purpose=data["purpose"],
            refund_paise=int(data["refund_paise"]),
            final_status=MilestoneStatus(data["final_status"]),
            release_rest=bool(data["release_rest"]),
            why=data["why"],
            attempt=int(data.get("attempt", 0)),
        )


@dataclass(frozen=True)
class RefundOutcome:
    completed: bool
    message: str


def refund_split(milestone: Milestone, refund_paise: int) -> tuple[int, int, int, int]:
    """(reverse from the transfer, released to the maker, platform fee returned, TDS returned)."""
    reverse = min(refund_paise, milestone.transfer_paise)
    beyond_transfer = refund_paise - reverse
    fee_returned = min(beyond_transfer, milestone.platform_fee_paise)
    tds_returned = beyond_transfer - fee_returned
    return reverse, milestone.transfer_paise - reverse, fee_returned, tds_returned


def begin(milestone: Milestone, intent: RefundIntent) -> None:
    if intent.final_status == MilestoneStatus.REFUNDED:
        milestone.status = MilestoneStatus.REFUND_REQUESTED
    milestone.refund_intent = intent.as_json()


async def run_refund(ctx: AppContext, deal_id: uuid.UUID, milestone_id: uuid.UUID) -> RefundOutcome:
    """The two steps. The caller holds the deal lock and has saved a RefundIntent on the milestone."""
    async with ctx.sessions() as session:
        milestone = await load_milestone(session, milestone_id)
        payment = await require_captured_payment(session, deal_id)
    if milestone.refund_intent is None or not milestone.razorpay_transfer_id or not payment.razorpay_payment_id:
        raise MoneyError("There's no refund waiting on this milestone.")
    intent = RefundIntent.from_json(milestone.refund_intent)
    if milestone.status in (MilestoneStatus.REFUNDED, MilestoneStatus.RESOLVED) and milestone.refunded_at:
        return RefundOutcome(True, "Already refunded.")
    reverse_paise, release_paise, fee_returned, tds_returned = refund_split(milestone, intent.refund_paise)
    now = ctx.clock.now()

    if reverse_paise > 0:
        try:
            reversal = await ctx.gateway.reverse_transfer(
                milestone.razorpay_transfer_id,
                amount_paise=reverse_paise,
                idempotency_key=f"{intent.purpose}-rev-{milestone.id}",
            )
        except GatewayError as exc:
            await _stuck(ctx, deal_id, milestone, f"Reversing the transfer failed: {exc}", step="reverse")
            raise MoneyError(
                "Razorpay didn't take the money back from the transfer, so nothing has moved. We've been told and "
                "will finish this from our side.",
                status_code=502,
                code="reversal_failed",
            ) from exc
        async with transaction(ctx.sessions) as session:
            await ledger.record(
                session,
                deal_id=deal_id,
                milestone_id=milestone.id,
                kind=LedgerKind.REVERSED,
                amount_paise=reversal.amount_paise,
                razorpay_object_id=reversal.id,
                key=f"reversed:{reversal.id}",
                at=now,
                note=f"Taken back from the Maker's held transfer for milestone {roman(milestone.idx)}.",
            )

    try:
        refund = await ctx.gateway.refund_payment(
            payment.razorpay_payment_id,
            amount_paise=intent.refund_paise,
            idempotency_key=f"{intent.purpose}-rfnd-{milestone.id}{intent.refund_key_suffix}",
            notes={"deal_id": str(deal_id), "milestone_id": str(milestone.id), "purpose": intent.purpose},
        )
    except GatewayError as exc:
        await _stuck(
            ctx, deal_id, milestone, f"The refund failed after the reversal went through: {exc}", step="refund"
        )
        return RefundOutcome(
            False,
            "The money is back from the transfer, but Razorpay hasn't accepted the refund yet. It's in our queue "
            "and someone will finish it; you don't need to do anything.",
        )

    if refund.status == "failed":
        await _stuck(ctx, deal_id, milestone, f"Razorpay returned refund {refund.id} as failed.", step="refund")
        return RefundOutcome(
            False, "Razorpay couldn't complete the refund. It's in our queue and someone will finish it."
        )

    released_transfer = None
    if intent.release_rest and release_paise > 0:
        try:
            transfer = await ctx.gateway.set_transfer_hold(milestone.razorpay_transfer_id, on_hold=False, until=None)
        except GatewayError as exc:
            await _release_stuck(ctx, deal_id, milestone, f"Refund done, but releasing the rest failed: {exc}")
        else:
            if transfer.on_hold:
                await _release_stuck(ctx, deal_id, milestone, "Refund done, but Razorpay still shows the rest on hold.")
            else:
                released_transfer = transfer

    await _record_refund(
        ctx,
        deal_id,
        milestone.id,
        intent,
        refund,
        fee_returned,
        tds_returned,
        released_transfer is not None,
        release_paise,
    )
    return RefundOutcome(True, f"{rupees(intent.refund_paise)} is on its way back.")


async def _record_refund(
    ctx: AppContext,
    deal_id: uuid.UUID,
    milestone_id: uuid.UUID,
    intent: RefundIntent,
    refund: Refund,
    fee_returned: int,
    tds_returned: int,
    released: bool,
    release_paise: int,
) -> None:
    async with transaction(ctx.sessions) as session:
        deal = await load_deal(session, deal_id, lock=True)
        milestone = next(m for m in deal.milestones if m.id == milestone_id)
        now = ctx.clock.now()
        await ledger.record(
            session,
            deal_id=deal.id,
            milestone_id=milestone.id,
            kind=LedgerKind.REFUNDED,
            amount_paise=refund.amount_paise,
            razorpay_object_id=refund.id,
            key=f"refunded:{refund.id}",
            at=now,
            note="Refunded to the Client. The processing fee is not refunded.",
        )
        for kind, amount in ((LedgerKind.FEE_RETURNED, fee_returned), (LedgerKind.TDS_RETURNED, tds_returned)):
            if amount > 0:
                await ledger.record(
                    session,
                    deal_id=deal.id,
                    milestone_id=milestone.id,
                    kind=kind,
                    amount_paise=amount,
                    razorpay_object_id=refund.id,
                    key=f"{kind.value}:{refund.id}",
                    at=now,
                    note="Returned to the Client with the refund, since the work it was kept from wasn't paid for.",
                )
        if released and milestone.razorpay_transfer_id:
            milestone.released_at = now
            await ledger.record(
                session,
                deal_id=deal.id,
                milestone_id=milestone.id,
                kind=LedgerKind.RELEASED,
                amount_paise=release_paise,
                razorpay_object_id=milestone.razorpay_transfer_id,
                key=f"released:{milestone.razorpay_transfer_id}",
                at=now,
                note="The Maker's share, released for the next settlement.",
            )
        milestone.refund_paise = refund.amount_paise
        milestone.refunded_at = now
        milestone.status = intent.final_status
        await session.execute(
            update(ReconciliationFlag)
            .where(
                ReconciliationFlag.milestone_id == milestone.id,
                ReconciliationFlag.kind == FlagKind.REFUND_STUCK,
                ReconciliationFlag.resolved_at.is_(None),
            )
            .values(resolved_at=now, resolution_note="Refund went through on a later attempt.")
        )
        apply_status(deal, now)
        facts = await deal_facts(session, ctx.settings, deal)
        summary = f"{rupees(refund.amount_paise)} for milestone {roman(milestone.idx)} refunded to {facts.client}."
        if released:
            summary += f" {rupees(release_paise)} released to {facts.maker}."
        await register.log(
            session,
            deal_id=deal.id,
            milestone_id=milestone.id,
            kind="refunded",
            summary=f"{summary} {intent.why}",
            role=Role.SYSTEM,
            at=now,
        )
        await queue_record(
            session,
            ctx.settings,
            deal=deal,
            maker_id=await maker_id_of(session, deal),
            kind=RegistryKind.REFUNDED,
            razorpay_id=refund.id,
            milestone=milestone,
        )
        maker_email, client_email = await party_emails(session, deal)
        message = messages.milestone_refunded(
            facts, milestone_facts(milestone), refund_paise=refund.amount_paise, why=intent.why
        )
        for to in (maker_email, client_email):
            queue_email(session, to=to, template="milestone_refunded", deal_id=deal.id, message=message)


async def _release_stuck(ctx: AppContext, deal_id: uuid.UUID, milestone: Milestone, reason: str) -> None:
    """Its own kind of flag: recording the refund closes refund_stuck flags, and this one must stay open until
    the Maker's share is confirmed released."""
    sentry_sdk.capture_message(f"release stuck after refund for milestone {milestone.id}: {reason}", level="error")
    log.error("release stuck after refund for milestone %s", milestone.id)
    async with transaction(ctx.sessions) as session:
        await raise_flag(
            session,
            deal_id=deal_id,
            milestone_id=milestone.id,
            kind=FlagKind.RELEASE_STUCK,
            summary=f"Milestone {milestone.idx}: {reason}",
            detail={"transfer_id": milestone.razorpay_transfer_id},
            at=ctx.clock.now(),
        )


async def retry_release(ctx: AppContext, milestone_id: uuid.UUID) -> str:
    """Admin: release what's left of a transfer after a refund, once Razorpay confirms the hold is off."""
    async with ctx.sessions() as session:
        milestone = await load_milestone(session, milestone_id)
    async with deal_lock(ctx.engine, milestone.deal_id):
        async with ctx.sessions() as session:
            milestone = await load_milestone(session, milestone_id)
            flag = (
                await session.execute(
                    select(ReconciliationFlag).where(
                        ReconciliationFlag.milestone_id == milestone.id,
                        ReconciliationFlag.kind == FlagKind.RELEASE_STUCK,
                        ReconciliationFlag.resolved_at.is_(None),
                    )
                )
            ).scalar_one_or_none()
        if flag is None or not milestone.razorpay_transfer_id:
            return "Nothing is waiting to be released on this milestone."
        try:
            transfer = await ctx.gateway.set_transfer_hold(milestone.razorpay_transfer_id, on_hold=False, until=None)
        except GatewayError as exc:
            raise MoneyError(f"Razorpay didn't release it: {exc}", status_code=502, code="release_failed") from exc
        if transfer.on_hold:
            raise MoneyError("Razorpay still shows the money on hold. Try again later.", status_code=502)
        release_paise = transfer.amount_paise - transfer.amount_reversed_paise
        async with transaction(ctx.sessions) as session:
            deal = await load_deal(session, milestone.deal_id, lock=True)
            stored = next(m for m in deal.milestones if m.id == milestone.id)
            now = ctx.clock.now()
            stored.released_at = now
            await ledger.record(
                session,
                deal_id=deal.id,
                milestone_id=stored.id,
                kind=LedgerKind.RELEASED,
                amount_paise=release_paise,
                razorpay_object_id=transfer.id,
                key=f"released:{transfer.id}",
                at=now,
                note="The Maker's share, released for the next settlement.",
            )
            await session.execute(
                update(ReconciliationFlag)
                .where(ReconciliationFlag.id == flag.id)
                .values(resolved_at=now, resolution_note="Released on a later attempt.")
            )
            facts = await deal_facts(session, ctx.settings, deal)
            await register.log(
                session,
                deal_id=deal.id,
                milestone_id=stored.id,
                kind="released",
                summary=f"{rupees(release_paise)} for milestone {roman(stored.idx)} released to {facts.maker}.",
                role=Role.SYSTEM,
                at=now,
            )
    return f"{rupees(release_paise)} released for the next settlement."


async def _stuck(ctx: AppContext, deal_id: uuid.UUID, milestone: Milestone, reason: str, *, step: str) -> None:
    sentry_sdk.capture_message(f"refund stuck at {step} for milestone {milestone.id}: {reason}", level="error")
    log.error("refund stuck at %s for milestone %s", step, milestone.id)
    async with transaction(ctx.sessions) as session:
        await raise_flag(
            session,
            deal_id=deal_id,
            milestone_id=milestone.id,
            kind=FlagKind.REFUND_STUCK,
            summary=f"Milestone {milestone.idx}: {reason}",
            detail={"step": step, "transfer_id": milestone.razorpay_transfer_id},
            at=ctx.clock.now(),
        )


def refund_opens_at(milestone: Milestone, grace_days: int) -> Any:
    return milestone.due_at + timedelta(days=grace_days)


async def request_refund(ctx: AppContext, milestone_id: uuid.UUID, actor: User) -> RefundOutcome:
    async with ctx.sessions() as session:
        deal_id = (await load_milestone(session, milestone_id)).deal_id
    async with deal_lock(ctx.engine, deal_id):
        async with transaction(ctx.sessions) as session:
            deal = await load_deal(session, deal_id, lock=True)
            require_role(deal, actor.id, Role.CLIENT)
            milestone = next(m for m in deal.milestones if m.id == milestone_id)
            now = ctx.clock.now()
            if milestone.status == MilestoneStatus.REFUNDED:
                return RefundOutcome(True, "Already refunded.")
            if milestone.status == MilestoneStatus.HELD:
                opens = refund_opens_at(milestone, ctx.settings.grace_days)
                if now < opens:
                    raise MoneyError(
                        f"You can ask for this money back from {ist_day(opens)}, {ctx.settings.grace_days} days after "
                        "its due date, if it still hasn't been delivered."
                    )
                intent = RefundIntent(
                    purpose="refund",
                    refund_paise=milestone.amount_paise,
                    final_status=MilestoneStatus.REFUNDED,
                    release_rest=False,
                    why=f"It wasn't delivered within {ctx.settings.grace_days} days of its due date.",
                )
                begin(milestone, intent)
                facts = await deal_facts(session, ctx.settings, deal)
                await register.log(
                    session,
                    deal_id=deal.id,
                    milestone_id=milestone.id,
                    kind="refund_requested",
                    summary=f"{facts.client} asked for milestone {roman(milestone.idx)}'s "
                    f"{rupees(milestone.amount_paise)} back: it wasn't delivered in time.",
                    role=Role.CLIENT,
                    actor_id=actor.id,
                    at=now,
                )
            elif milestone.status != MilestoneStatus.REFUND_REQUESTED:
                raise MoneyError("A refund can only be asked for on held money that wasn't delivered in time.")
        return await run_refund(ctx, deal_id, milestone_id)


async def retry_refund(ctx: AppContext, milestone_id: uuid.UUID) -> RefundOutcome:
    """Admin: run a stuck refund again with the same keys."""
    async with ctx.sessions() as session:
        deal_id = (await load_milestone(session, milestone_id)).deal_id
    async with deal_lock(ctx.engine, deal_id):
        return await run_refund(ctx, deal_id, milestone_id)


async def stuck_refunds(ctx: AppContext) -> list[Milestone]:
    async with ctx.sessions() as session:
        return list(
            (
                await session.execute(select(Milestone).where(Milestone.status == MilestoneStatus.REFUND_REQUESTED))
            ).scalars()
        )


async def refund_event(ctx: AppContext, refund: Refund, *, failed: bool, webhook_event_id: str | None) -> None:
    """refund.processed confirms what the API already told us; refund.failed puts it back in the queue."""
    milestone_id_text = refund.notes.get("milestone_id")
    if not milestone_id_text:
        return
    milestone_id = uuid.UUID(milestone_id_text)
    async with transaction(ctx.sessions) as session:
        milestone = await load_milestone(session, milestone_id, lock=True)
        now = ctx.clock.now()
        if not failed:
            return
        await ledger.record(
            session,
            deal_id=milestone.deal_id,
            milestone_id=milestone.id,
            kind=LedgerKind.REFUND_FAILED,
            amount_paise=refund.amount_paise,
            razorpay_object_id=refund.id,
            key=f"refund_failed:{refund.id}",
            webhook_event_id=webhook_event_id,
            at=now,
            note="Razorpay reported that the refund failed.",
        )
        milestone.status = MilestoneStatus.REFUND_REQUESTED
        milestone.refunded_at = None
        if milestone.refund_intent is not None:
            intent = RefundIntent.from_json(milestone.refund_intent)
            milestone.refund_intent = {**intent.as_json(), "attempt": intent.attempt + 1}
        await raise_flag(
            session,
            deal_id=milestone.deal_id,
            milestone_id=milestone.id,
            kind=FlagKind.REFUND_STUCK,
            summary=f"Razorpay reported refund {refund.id} for milestone {milestone.idx} as failed.",
            detail={"refund_id": refund.id, "step": "refund"},
            at=now,
        )
