"""From an accepted deed to money held: the order, Checkout, the capture and the transfers on hold."""

import logging
import uuid

import sentry_sdk
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from vaada import register
from vaada.context import AppContext
from vaada.db import transaction
from vaada.email import messages
from vaada.email.outbox import queue_email
from vaada.format import rupees
from vaada.models import Deal, Payment, User
from vaada.models.enums import (
    DealStatus,
    FlagKind,
    LedgerKind,
    MilestoneStatus,
    PaymentStatus,
    RegistryKind,
    Role,
)
from vaada.money import ledger
from vaada.money.common import (
    apply_status,
    deal_facts,
    load_deal,
    maker_id_of,
    party_emails,
    payout_account_of,
    require_role,
)
from vaada.money.errors import GatewayTroubleError, MoneyError, NotFoundError
from vaada.money.fees import FeeMisconfiguredError, assert_transfers_fit, ceil_bps, deal_money_for
from vaada.money.flags import raise_flag
from vaada.money.gateway import (
    CheckoutConfig,
    GatewayRejectedError,
    GatewayUnavailableError,
    Order,
    Transfer,
    TransferRequest,
)
from vaada.money.gateway import (
    Payment as GatewayPayment,
)
from vaada.money.locks import deal_lock
from vaada.registry.queue import queue_record

log = logging.getLogger(__name__)

ORDER_REUSABLE = frozenset({PaymentStatus.CREATED, PaymentStatus.AUTHORIZED})


async def create_order(ctx: AppContext, deal_id: uuid.UUID, payer: User) -> CheckoutConfig:
    async with deal_lock(ctx.engine, deal_id):
        async with transaction(ctx.sessions) as session:
            deal = await load_deal(session, deal_id)
            require_role(deal, payer.id, Role.CLIENT)
            now = ctx.clock.now()
            if deal.status != DealStatus.ACCEPTED:
                raise MoneyError("This deed isn't waiting for payment.")
            if deal.pay_by is not None and now > deal.pay_by:
                raise MoneyError("The time to pay this deed has passed. Ask the Maker to re-issue it with new dates.")
            existing = (
                await session.execute(
                    select(Payment).where(Payment.deal_id == deal.id, Payment.status.in_(ORDER_REUSABLE))
                )
            ).scalar_one_or_none()
            payout = await payout_account_of(session, deal.freelancer_id)
            if payout is None or not payout.razorpay_account_id:
                raise MoneyError("The Maker's payout account isn't ready, so this deed can't be paid yet.")
            milestones = list(deal.milestones)
            facts = await deal_facts(session, ctx.settings, deal)

        money = deal_money_for([m.amount_paise for m in milestones], ctx.settings)
        if money.order_paise != deal.total_paise + deal.client_fee_paise or any(
            m.transfer_paise != mm.transfer_paise for m, mm in zip(milestones, money.milestones, strict=True)
        ):
            raise MoneyError(
                "Our fee settings changed after this deed was sent. We've been told; nothing has been charged.",
                status_code=503,
                code="fee_changed",
            )
        try:
            assert_transfers_fit(
                money,
                gateway_fee_bps=ctx.settings.gateway_fee_bps,
                route_transfer_fee_bps=ctx.settings.route_transfer_fee_bps,
            )
        except FeeMisconfiguredError as exc:
            sentry_sdk.capture_exception(exc)
            log.error("refused order for deal %s: %s", deal.id, exc)
            raise MoneyError(
                "We can't take this payment right now because of a problem on our side. Nothing has been charged, "
                "and we've been told.",
                status_code=503,
                code="fee_misconfigured",
            ) from exc

        order: Order | None = None
        if existing is not None:
            try:
                order = await ctx.gateway.fetch_order(existing.razorpay_order_id)
            except GatewayUnavailableError as exc:
                raise GatewayTroubleError() from exc
            if order.status == "paid":
                raise MoneyError("This deed is already paid. Razorpay is confirming it now.")
        if order is None:
            transfers = [
                TransferRequest(
                    account_id=payout.razorpay_account_id,
                    amount_paise=m.transfer_paise,
                    notes={
                        "deal_id": str(deal.id),
                        "milestone_id": str(m.id),
                        "milestone_idx": str(m.idx),
                        "deed_no": str(deal.deed_no),
                    },
                    on_hold=True,
                )
                for m in milestones
            ]
            try:
                order = await ctx.gateway.create_order(
                    amount_paise=money.order_paise,
                    receipt=f"deed-{deal.deed_no:04d}",
                    transfers=transfers,
                    notes={"deal_id": str(deal.id), "deed_no": str(deal.deed_no)},
                )
            except GatewayUnavailableError as exc:
                raise GatewayTroubleError() from exc
            except GatewayRejectedError as exc:
                sentry_sdk.capture_exception(exc)
                raise MoneyError(
                    "Razorpay wouldn't open a payment for this deed. Nothing has been charged, and we've been told.",
                    status_code=502,
                    code="order_rejected",
                ) from exc
            async with transaction(ctx.sessions) as session:
                session.add(
                    Payment(
                        deal_id=deal.id,
                        razorpay_order_id=order.id,
                        amount_paise=order.amount_paise,
                        client_fee_paise=deal.client_fee_paise,
                    )
                )

    return ctx.gateway.checkout_config(
        order=order,
        upi_limit_paise=ctx.settings.upi_limit_paise,
        prefill={"name": payer.display_name or "", "email": payer.email or ""},
        description=f"Deed No. {facts.no}: {facts.title}"[:255],
    )


async def record_checkout_return(
    ctx: AppContext, deal_id: uuid.UUID, payer: User, *, order_id: str, payment_id: str, signature: str
) -> None:
    """Checkout's success callback. It proves the browser saw a payment, nothing more: the capture
    webhook is what moves money state."""
    if not ctx.gateway.verify_checkout_signature(order_id=order_id, payment_id=payment_id, signature=signature):
        raise MoneyError(
            "That payment confirmation didn't check out. If money left your account, Razorpay will confirm it "
            "here within a few minutes; otherwise, try paying again.",
            status_code=400,
            code="bad_signature",
        )
    async with transaction(ctx.sessions) as session:
        deal = await load_deal(session, deal_id)
        require_role(deal, payer.id, Role.CLIENT)
        payment = (
            await session.execute(select(Payment).where(Payment.razorpay_order_id == order_id).with_for_update())
        ).scalar_one_or_none()
        if payment is None or payment.deal_id != deal.id:
            raise NotFoundError("That payment")
        now = ctx.clock.now()
        if payment.razorpay_payment_id is None:
            payment.razorpay_payment_id = payment_id
        if payment.status == PaymentStatus.CREATED:
            payment.status = PaymentStatus.AUTHORIZED
        payment.signature_verified_at = payment.signature_verified_at or now
        await register.log(
            session,
            deal_id=deal.id,
            kind="payment_returned",
            summary="Payment made in Razorpay Checkout. Waiting for Razorpay to confirm it.",
            role=Role.CLIENT,
            actor_id=payer.id,
            at=now,
        )
    await ctx.kick("process_webhooks")


async def settle_capture(ctx: AppContext, entity: GatewayPayment, *, webhook_event_id: str | None) -> None:
    """A captured payment, learned from a verified webhook. Safe to run any number of times."""
    if entity.order_id is None:
        return
    async with transaction(ctx.sessions) as session:
        payment = (
            await session.execute(select(Payment).where(Payment.razorpay_order_id == entity.order_id))
        ).scalar_one_or_none()
        if payment is None:
            log.warning("capture for unknown order %s", entity.order_id)
            return
        deal_id = payment.deal_id

    async with deal_lock(ctx.engine, deal_id):
        async with transaction(ctx.sessions) as session:
            payment = (
                await session.execute(
                    select(Payment).where(Payment.razorpay_order_id == entity.order_id).with_for_update()
                )
            ).scalar_one()
            deal = await load_deal(session, deal_id, lock=True)
            now = ctx.clock.now()
            newly_captured = payment.status != PaymentStatus.CAPTURED
            payment.status = PaymentStatus.CAPTURED
            payment.razorpay_payment_id = entity.id
            payment.method = entity.method
            payment.gateway_fee_paise = entity.fee_paise
            payment.gateway_tax_paise = entity.tax_paise
            payment.captured_at = payment.captured_at or entity.captured_at or now
            await ledger.record(
                session,
                deal_id=deal.id,
                kind=LedgerKind.CAPTURED,
                amount_paise=entity.amount_paise,
                razorpay_object_id=entity.id,
                key=f"captured:{entity.id}",
                webhook_event_id=webhook_event_id,
                at=now,
                note=f"Client paid {rupees(entity.amount_paise)} by {entity.method or 'Checkout'}.",
            )
            if payment.client_fee_paise > 0:
                await ledger.record(
                    session,
                    deal_id=deal.id,
                    kind=LedgerKind.FEE_RETAINED,
                    amount_paise=payment.client_fee_paise,
                    razorpay_object_id=entity.id,
                    key=f"fee_retained:processing:{entity.id}",
                    webhook_event_id=webhook_event_id,
                    at=now,
                    note="Processing fee paid by the client; covers Razorpay's fee. Not refundable.",
                )
            for m in deal.milestones:
                if m.platform_fee_paise:
                    await ledger.record(
                        session,
                        deal_id=deal.id,
                        milestone_id=m.id,
                        kind=LedgerKind.FEE_RETAINED,
                        amount_paise=m.platform_fee_paise,
                        razorpay_object_id=entity.id,
                        key=f"fee_retained:platform:{m.id}",
                        webhook_event_id=webhook_event_id,
                        at=now,
                        note="Platform fee kept from this milestone.",
                    )
                if m.tds_paise:
                    await ledger.record(
                        session,
                        deal_id=deal.id,
                        milestone_id=m.id,
                        kind=LedgerKind.TDS_WITHHELD,
                        amount_paise=m.tds_paise,
                        razorpay_object_id=entity.id,
                        key=f"tds_withheld:{m.id}",
                        webhook_event_id=webhook_event_id,
                        at=now,
                        note="Tax deducted at source from this milestone.",
                    )
            budget = payment.client_fee_paise
            route_budget = sum(ceil_bps(m.transfer_paise, ctx.settings.route_transfer_fee_bps) for m in deal.milestones)
            if entity.fee_paise is not None and entity.fee_paise + route_budget > budget:
                await raise_flag(
                    session,
                    deal_id=deal.id,
                    kind=FlagKind.FEE_EXCEEDED,
                    summary=f"Razorpay's fee {rupees(entity.fee_paise)} is more than the processing fee "
                    f"{rupees(budget)} the client paid.",
                    detail={"payment_id": entity.id, "fee": entity.fee_paise, "method": entity.method},
                    at=now,
                )
            if deal.status in (DealStatus.LAPSED, DealStatus.CANCELLED):
                await raise_flag(
                    session,
                    deal_id=deal.id,
                    kind=FlagKind.PAYMENT_ON_CLOSED_DEAL,
                    summary=f"A payment of {rupees(entity.amount_paise)} was captured on a {deal.status} deed.",
                    detail={"payment_id": entity.id},
                    at=now,
                )
            if newly_captured:
                await register.log(
                    session,
                    deal_id=deal.id,
                    kind="payment_captured",
                    summary=f"Razorpay confirmed the payment of {rupees(entity.amount_paise)}.",
                    role=Role.SYSTEM,
                    at=now,
                )
        await _sync_transfers(ctx, deal_id, entity.id, webhook_event_id=webhook_event_id)


async def _sync_transfers(
    ctx: AppContext, deal_id: uuid.UUID, payment_id: str, *, webhook_event_id: str | None
) -> None:
    try:
        transfers = await ctx.gateway.fetch_payment_transfers(payment_id)
    except GatewayUnavailableError:
        log.warning("could not fetch transfers for %s; transfer webhooks or reconciliation will catch up", payment_id)
        return
    async with transaction(ctx.sessions) as session:
        deal = await load_deal(session, deal_id, lock=True)
        for transfer in transfers:
            await apply_transfer(ctx, session, deal, transfer, webhook_event_id=webhook_event_id)
        await _maybe_mark_funded(ctx, session, deal)


async def apply_transfer(
    ctx: AppContext, session: AsyncSession, deal: Deal, transfer: Transfer, *, webhook_event_id: str | None
) -> None:
    milestone_id = transfer.milestone_id
    milestone = next((m for m in deal.milestones if str(m.id) == milestone_id), None)
    if milestone is None:
        log.warning("transfer %s names no milestone of deal %s", transfer.id, deal.id)
        return
    now = ctx.clock.now()
    if milestone.razorpay_transfer_id is None:
        milestone.razorpay_transfer_id = transfer.id
    if transfer.status == "failed":
        recorded = await ledger.record(
            session,
            deal_id=deal.id,
            milestone_id=milestone.id,
            kind=LedgerKind.TRANSFER_FAILED,
            amount_paise=transfer.amount_paise,
            razorpay_object_id=transfer.id,
            key=f"transfer_failed:{transfer.id}",
            webhook_event_id=webhook_event_id,
            at=now,
            note=f"Razorpay could not hold this milestone's money: {transfer.error_reason or 'unknown reason'}.",
        )
        if recorded:
            await raise_flag(
                session,
                deal_id=deal.id,
                milestone_id=milestone.id,
                kind=FlagKind.TRANSFER_FAILED,
                summary=f"Transfer {transfer.id} for milestone {milestone.idx} failed: "
                f"{transfer.error_reason or 'unknown reason'}.",
                detail={"transfer_id": transfer.id, "reason": transfer.error_reason},
                at=now,
            )
            await register.log(
                session,
                deal_id=deal.id,
                milestone_id=milestone.id,
                kind="transfer_failed",
                summary=f"Razorpay couldn't set aside the money for milestone {milestone.idx}. "
                "Vaada is looking into it.",
                role=Role.SYSTEM,
                at=now,
            )
        return
    if milestone.status == MilestoneStatus.UNFUNDED:
        milestone.status = MilestoneStatus.HELD
        await ledger.record(
            session,
            deal_id=deal.id,
            milestone_id=milestone.id,
            kind=LedgerKind.HELD,
            amount_paise=transfer.amount_paise,
            razorpay_object_id=transfer.id,
            key=f"held:{transfer.id}",
            webhook_event_id=webhook_event_id,
            at=now,
            note="Held by Razorpay until the work is approved or the review window ends.",
        )


async def _maybe_mark_funded(ctx: AppContext, session: AsyncSession, deal: Deal) -> None:
    if deal.status != DealStatus.ACCEPTED:
        return
    payment = (
        await session.execute(
            select(Payment).where(Payment.deal_id == deal.id, Payment.status == PaymentStatus.CAPTURED)
        )
    ).scalar_one_or_none()
    if payment is None or not all(m.status == MilestoneStatus.HELD for m in deal.milestones):
        return
    now = ctx.clock.now()
    deal.funded_at = now
    apply_status(deal, now)
    await register.log(
        session,
        deal_id=deal.id,
        kind="funded",
        summary=f"{rupees(deal.total_paise or 0)} is held by Razorpay. Work can begin.",
        role=Role.SYSTEM,
        at=now,
    )
    await queue_record(
        session,
        ctx.settings,
        deal=deal,
        maker_id=await maker_id_of(session, deal),
        kind=RegistryKind.FUNDED,
        razorpay_id=payment.razorpay_payment_id,
    )
    facts = await deal_facts(session, ctx.settings, deal)
    maker_email, client_email = await party_emails(session, deal)
    first_due = min(m.due_at for m in deal.milestones)
    for role, to in (("maker", maker_email), ("client", client_email)):
        queue_email(
            session,
            to=to,
            template="deal_funded",
            deal_id=deal.id,
            message=messages.deal_funded(facts, role=role, total_paise=deal.total_paise or 0, first_due=first_due),
        )


async def transfer_event(ctx: AppContext, transfer: Transfer, *, webhook_event_id: str | None) -> None:
    """transfer.processed or transfer.failed, in whatever order they arrive relative to the capture."""
    deal_id_text = transfer.notes.get("deal_id")
    if not deal_id_text:
        return
    deal_id = uuid.UUID(deal_id_text)
    async with deal_lock(ctx.engine, deal_id), transaction(ctx.sessions) as session:
        deal = await load_deal(session, deal_id, lock=True)
        await apply_transfer(ctx, session, deal, transfer, webhook_event_id=webhook_event_id)
        await _maybe_mark_funded(ctx, session, deal)


async def payment_failed(ctx: AppContext, entity: GatewayPayment) -> None:
    if entity.order_id is None:
        return
    async with transaction(ctx.sessions) as session:
        payment = (
            await session.execute(select(Payment).where(Payment.razorpay_order_id == entity.order_id).with_for_update())
        ).scalar_one_or_none()
        if payment is None or payment.status == PaymentStatus.CAPTURED:
            return
        payment.failure_reason = entity.error_reason
        await register.log(
            session,
            deal_id=payment.deal_id,
            kind="payment_failed",
            summary="A payment attempt didn't go through. No money moved. The Client can try again.",
            role=Role.SYSTEM,
            at=ctx.clock.now(),
        )


async def payment_authorized(ctx: AppContext, entity: GatewayPayment) -> None:
    if entity.order_id is None:
        return
    async with transaction(ctx.sessions) as session:
        payment = (
            await session.execute(select(Payment).where(Payment.razorpay_order_id == entity.order_id).with_for_update())
        ).scalar_one_or_none()
        if payment is None:
            return
        if payment.status == PaymentStatus.CREATED:
            payment.status = PaymentStatus.AUTHORIZED
        payment.razorpay_payment_id = payment.razorpay_payment_id or entity.id
