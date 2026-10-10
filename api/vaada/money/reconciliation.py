"""Every 15 minutes, compare what Razorpay says with what we think. Drift, failed transfers and refund
deadlines go to the admin queue and Sentry. Money state is never corrected from here."""

import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from vaada.context import AppContext
from vaada.db import transaction
from vaada.format import ist_day, roman
from vaada.models import Deal, Payment
from vaada.models.enums import DealStatus, FlagKind, MilestoneStatus, PaymentStatus
from vaada.money.common import SETTLED_STATES
from vaada.money.flags import raise_flag
from vaada.money.gateway import GatewayError, Transfer

log = logging.getLogger(__name__)

OPEN_DEALS = (DealStatus.FUNDED, DealStatus.ACTIVE, DealStatus.DISPUTED, DealStatus.CANCELLED, DealStatus.ACCEPTED)


def _drift(
    milestone_status: MilestoneStatus,
    transfer: Transfer,
    expected_hold_until_unix: int | None,
    now_unix: int,
    transfer_paise: int,
    refund_reverse: int,
) -> str | None:
    if transfer.amount_paise != transfer_paise:
        return f"Razorpay's transfer is {transfer.amount_paise} paise, ours says {transfer_paise}."
    held_by_us = milestone_status in (MilestoneStatus.HELD, MilestoneStatus.DISPUTED, MilestoneStatus.REFUND_REQUESTED)
    lifted = transfer.hold_lifted(datetime.fromtimestamp(now_unix, tz=UTC))
    if held_by_us and lifted and transfer.amount_reversed_paise < transfer.amount_paise:
        return "We hold this milestone's money, but Razorpay shows the hold lifted."
    if milestone_status == MilestoneStatus.DELIVERED:
        actual = int(transfer.on_hold_until.timestamp()) if transfer.on_hold_until else None
        if not lifted and actual != expected_hold_until_unix:
            return f"Release time differs: Razorpay {actual}, ours {expected_hold_until_unix}."
    if milestone_status == MilestoneStatus.RELEASED and transfer.on_hold and transfer.on_hold_until is None:
        return "We recorded a release, but Razorpay still holds the transfer with no end date."
    if (
        milestone_status in (MilestoneStatus.REFUNDED, MilestoneStatus.RESOLVED)
        and transfer.amount_reversed_paise != refund_reverse
    ):
        return f"Reversed amount differs: Razorpay {transfer.amount_reversed_paise}, expected {refund_reverse}."
    return None


async def reconcile(ctx: AppContext) -> int:
    now = ctx.clock.now()
    new_flags = 0
    async with ctx.sessions() as session:
        rows = (
            await session.execute(
                select(Deal, Payment)
                .join(Payment, Payment.deal_id == Deal.id)
                .where(Deal.status.in_(OPEN_DEALS), Payment.status == PaymentStatus.CAPTURED)
            )
        ).all()
    for deal, payment in rows:
        if not payment.razorpay_payment_id:
            continue
        try:
            transfers = {t.id: t for t in await ctx.gateway.fetch_payment_transfers(payment.razorpay_payment_id)}
        except GatewayError as exc:
            log.warning("reconciliation could not fetch transfers for deal %s: %s", deal.id, exc)
            continue
        async with transaction(ctx.sessions) as session:
            for m in deal.milestones:
                if m.status == MilestoneStatus.CANCELLED:
                    continue
                transfer = transfers.get(m.razorpay_transfer_id or "")
                if transfer is None:
                    if m.status != MilestoneStatus.UNFUNDED or deal.status != DealStatus.ACCEPTED:
                        new_flags += await raise_flag(
                            session,
                            deal_id=deal.id,
                            milestone_id=m.id,
                            kind=FlagKind.DRIFT,
                            at=now,
                            summary=f"Milestone {roman(m.idx)} has no matching transfer at Razorpay.",
                        )
                    continue
                if transfer.status == "failed":
                    new_flags += await raise_flag(
                        session,
                        deal_id=deal.id,
                        milestone_id=m.id,
                        kind=FlagKind.TRANSFER_FAILED,
                        at=now,
                        summary=f"Transfer {transfer.id} for milestone {roman(m.idx)} failed: {transfer.error_reason}.",
                        detail={"transfer_id": transfer.id},
                    )
                    continue
                expected_reverse = min(m.refund_paise, m.transfer_paise)
                hold_unix = int(m.hold_until.timestamp()) if m.hold_until else None
                problem = _drift(
                    m.status, transfer, hold_unix, int(now.timestamp()), m.transfer_paise, expected_reverse
                )
                if problem:
                    new_flags += await raise_flag(
                        session,
                        deal_id=deal.id,
                        milestone_id=m.id,
                        kind=FlagKind.DRIFT,
                        at=now,
                        summary=f"Milestone {roman(m.idx)}: {problem}",
                        detail={"transfer_id": transfer.id, "our_status": m.status.value},
                    )
            if payment.captured_at is not None:
                deadline = payment.captured_at + timedelta(days=ctx.settings.refund_limit_days)
                unsettled = [m for m in deal.milestones if m.status not in SETTLED_STATES]
                if unsettled and deadline - now <= timedelta(days=ctx.settings.refund_warning_days):
                    new_flags += await raise_flag(
                        session,
                        deal_id=deal.id,
                        kind=FlagKind.REFUND_DEADLINE,
                        at=now,
                        summary=f"Refunds on this payment stop being possible around {ist_day(deadline)}, and "
                        f"{len(unsettled)} milestone(s) are still open.",
                        detail={"payment_id": payment.razorpay_payment_id, "deadline": deadline.isoformat()},
                    )
    return new_flags
