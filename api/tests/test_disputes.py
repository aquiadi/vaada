from datetime import timedelta

import pytest
from sqlalchemy import select

from tests.factory import delivered, fake, ledger_total, milestone, reload
from vaada.context import AppContext
from vaada.models import Dispute, ReconciliationFlag, User
from vaada.models.enums import DealStatus, DisputeResolution, FlagKind, LedgerKind, MilestoneStatus
from vaada.money import delivery, disputes
from vaada.money.errors import MoneyError
from vaada.money.gateway import GatewayUnavailableError


async def _admin(ctx: AppContext) -> User:
    from tests.factory import make_user

    return await make_user(ctx, "Aj Admin", "aj@vaada.test")


async def test_a_dispute_at_the_last_second_still_holds_the_money(ctx: AppContext) -> None:
    scene = await delivered(ctx)
    m = milestone(scene.deal, 1)
    assert m.review_ends_at is not None
    ctx.clock.set(m.review_ends_at - timedelta(seconds=1))  # type: ignore[attr-defined]
    await disputes.open_dispute(ctx, m.id, scene.client, "The colours are not what we agreed.")
    deal = await reload(ctx, scene.deal.id)
    assert milestone(deal, 1).status == MilestoneStatus.DISPUTED
    assert deal.status == DealStatus.DISPUTED
    ctx.clock.advance(timedelta(days=30))  # type: ignore[attr-defined]
    transfer = await fake(ctx).fetch_transfer(m.razorpay_transfer_id or "")
    assert transfer.on_hold and transfer.on_hold_until is None
    assert await delivery.confirm_expired_holds(ctx) == 0
    assert milestone(await reload(ctx, scene.deal.id), 1).status == MilestoneStatus.DISPUTED


async def test_disputes_close_with_the_review_window(ctx: AppContext) -> None:
    scene = await delivered(ctx)
    m = milestone(scene.deal, 1)
    assert m.review_ends_at is not None
    ctx.clock.set(m.review_ends_at)  # type: ignore[attr-defined]
    with pytest.raises(MoneyError, match="Disputes for this milestone closed"):
        await disputes.open_dispute(ctx, m.id, scene.client, "Too late")


async def test_a_dispute_needs_a_reason_and_a_delivery(ctx: AppContext) -> None:
    scene = await delivered(ctx)
    with pytest.raises(MoneyError, match="Say what's wrong"):
        await disputes.open_dispute(ctx, milestone(scene.deal, 1).id, scene.client, "  ")
    with pytest.raises(MoneyError, match="only on delivered work"):
        await disputes.open_dispute(ctx, milestone(scene.deal, 2).id, scene.client, "Not delivered yet")


async def test_hold_failure_is_retried_until_razorpay_confirms(ctx: AppContext) -> None:
    scene = await delivered(ctx)
    m = milestone(scene.deal, 1)
    fake(ctx).fail_next("set_transfer_hold", GatewayUnavailableError("down"))
    dispute = await disputes.open_dispute(ctx, m.id, scene.maker, "Client is ghosting after delivery.")
    async with ctx.sessions() as session:
        stored = await session.get(Dispute, dispute.id)
        flags = (await session.execute(select(ReconciliationFlag.kind))).scalars().all()
    assert stored is not None and stored.hold_confirmed_at is None
    assert FlagKind.HOLD_NOT_CONFIRMED in flags
    assert await disputes.enforce_open_holds(ctx) == 1
    async with ctx.sessions() as session:
        stored = await session.get(Dispute, dispute.id)
    assert stored is not None and stored.hold_confirmed_at is not None
    assert (await fake(ctx).fetch_transfer(m.razorpay_transfer_id or "")).on_hold_until is None


async def test_resolve_by_release(ctx: AppContext) -> None:
    scene = await delivered(ctx)
    m = milestone(scene.deal, 1)
    dispute = await disputes.open_dispute(ctx, m.id, scene.client, "Not happy")
    planned = await disputes.resolve(
        ctx, dispute.id, await _admin(ctx), DisputeResolution.RELEASE, None, "Work matches the deed."
    )
    assert planned.maker_receives_paise == m.transfer_paise and planned.refund_paise == 0
    deal = await reload(ctx, scene.deal.id)
    assert milestone(deal, 1).status == MilestoneStatus.RESOLVED
    assert deal.status == DealStatus.ACTIVE
    assert not (await fake(ctx).fetch_transfer(m.razorpay_transfer_id or "")).on_hold


async def test_resolve_by_refund(ctx: AppContext) -> None:
    scene = await delivered(ctx)
    m = milestone(scene.deal, 1)
    dispute = await disputes.open_dispute(ctx, m.id, scene.client, "Wrong files entirely")
    await disputes.resolve(
        ctx, dispute.id, await _admin(ctx), DisputeResolution.REFUND, None, "Delivery did not match."
    )
    deal = await reload(ctx, scene.deal.id)
    assert milestone(deal, 1).status == MilestoneStatus.RESOLVED
    assert milestone(deal, 1).refund_paise == m.amount_paise
    assert await ledger_total(ctx, deal.id, LedgerKind.REVERSED) == m.transfer_paise
    assert await ledger_total(ctx, deal.id, LedgerKind.REFUNDED) == m.amount_paise


async def test_resolve_by_split_shows_both_sides_and_sums_to_the_paisa(ctx: AppContext) -> None:
    scene = await delivered(ctx)
    m = milestone(scene.deal, 1)
    dispute = await disputes.open_dispute(ctx, m.id, scene.client, "Half of it is missing")
    preview = await disputes.preview(ctx, dispute.id, DisputeResolution.SPLIT, 500_001)
    assert preview.client_sentence == "Rahul Mehta gets back ₹5,000.01."
    assert preview.maker_sentence == "Aditi Rao receives ₹7,499.99 on the next settlement."
    with pytest.raises(MoneyError, match="A split needs"):
        await disputes.preview(ctx, dispute.id, DisputeResolution.SPLIT, m.amount_paise)
    await disputes.resolve(ctx, dispute.id, await _admin(ctx), DisputeResolution.SPLIT, 500_001, "Half delivered.")
    deal = await reload(ctx, scene.deal.id)
    transfer = await fake(ctx).fetch_transfer(m.razorpay_transfer_id or "")
    assert transfer.amount_reversed_paise == 500_001
    assert not transfer.on_hold
    reversed_ = await ledger_total(ctx, deal.id, LedgerKind.REVERSED)
    released = await ledger_total(ctx, deal.id, LedgerKind.RELEASED)
    assert reversed_ + released == m.transfer_paise
    assert await ledger_total(ctx, deal.id, LedgerKind.REFUNDED) == 500_001


async def test_a_decided_dispute_cannot_be_decided_again(ctx: AppContext) -> None:
    scene = await delivered(ctx)
    dispute = await disputes.open_dispute(ctx, milestone(scene.deal, 1).id, scene.client, "Not happy")
    admin = await _admin(ctx)
    await disputes.resolve(ctx, dispute.id, admin, DisputeResolution.RELEASE, None, "Fine as delivered.")
    with pytest.raises(MoneyError, match="already decided"):
        await disputes.resolve(ctx, dispute.id, admin, DisputeResolution.REFUND, None, "Changed my mind.")
