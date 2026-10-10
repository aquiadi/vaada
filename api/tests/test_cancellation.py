from datetime import timedelta

import pytest
from sqlalchemy import select

from tests.factory import accepted, delivered, fake, ledger_total, milestone, reload
from vaada.context import AppContext
from vaada.models import Cancellation, RegistryRecord
from vaada.models.enums import DealStatus, LedgerKind, MilestoneStatus, ProposalStatus, RegistryKind
from vaada.money import cancellation, delivery
from vaada.money.errors import MoneyError


async def test_one_delivered_one_held_cancellation(ctx: AppContext) -> None:
    scene = await delivered(ctx)
    first, second = milestone(scene.deal, 1), milestone(scene.deal, 2)
    proposal = await cancellation.propose(ctx, scene.deal.id, scene.maker, "Client's project is on hold.")
    effect = cancellation.cancellation_effect(scene.deal, proposal.proposed_role, "Aditi Rao", "Rahul Mehta")
    assert effect.startswith("₹12,500 held for undelivered work goes back to Rahul Mehta; delivered milestone I")
    await cancellation.respond(ctx, proposal.id, scene.client, confirm=True)

    deal = await reload(ctx, scene.deal.id)
    assert deal.status == DealStatus.CANCELLED
    assert milestone(deal, 1).status == MilestoneStatus.DELIVERED
    assert milestone(deal, 2).status == MilestoneStatus.REFUNDED
    assert await ledger_total(ctx, deal.id, LedgerKind.REFUNDED) == second.amount_paise
    assert (await fake(ctx).fetch_transfer(first.razorpay_transfer_id or "")).on_hold

    ctx.clock.advance(timedelta(days=6, seconds=1))  # type: ignore[attr-defined]
    assert await delivery.confirm_expired_holds(ctx) == 1
    deal = await reload(ctx, scene.deal.id)
    assert milestone(deal, 1).status == MilestoneStatus.RELEASED
    assert deal.status == DealStatus.CANCELLED
    async with ctx.sessions() as session:
        kinds = set(
            (await session.execute(select(RegistryRecord.kind).where(RegistryRecord.deal_id == deal.id))).scalars()
        )
    assert RegistryKind.CANCELLED in kinds


async def test_released_money_is_never_pulled_back(ctx: AppContext) -> None:
    scene = await delivered(ctx)
    await delivery.approve(ctx, milestone(scene.deal, 1).id, scene.client)
    proposal = await cancellation.propose(ctx, scene.deal.id, scene.client, "We're pivoting.")
    await cancellation.respond(ctx, proposal.id, scene.maker, confirm=True)
    deal = await reload(ctx, scene.deal.id)
    assert milestone(deal, 1).status == MilestoneStatus.RELEASED
    transfer = await fake(ctx).fetch_transfer(milestone(deal, 1).razorpay_transfer_id or "")
    assert transfer.amount_reversed_paise == 0


async def test_kill_fee_applies_when_the_client_asks_to_end(ctx: AppContext) -> None:
    from tests.factory import funded

    scene = await funded(ctx, kill_fee=25)
    m = milestone(scene.deal, 1)
    proposal = await cancellation.propose(ctx, scene.deal.id, scene.client, "Budget got cut.")
    await cancellation.respond(ctx, proposal.id, scene.maker, confirm=True)
    deal = await reload(ctx, scene.deal.id)
    assert milestone(deal, 1).refund_paise == 937_500
    assert await ledger_total(ctx, deal.id, LedgerKind.REFUNDED) == 1_875_000
    assert await ledger_total(ctx, deal.id, LedgerKind.RELEASED) == 625_000
    transfer = await fake(ctx).fetch_transfer(m.razorpay_transfer_id or "")
    assert transfer.amount_reversed_paise == 937_500 and not transfer.on_hold


async def test_no_kill_fee_when_the_maker_asks_to_end(ctx: AppContext) -> None:
    from tests.factory import funded

    scene = await funded(ctx, kill_fee=25)
    proposal = await cancellation.propose(ctx, scene.deal.id, scene.maker, "I can't take this on after all.")
    await cancellation.respond(ctx, proposal.id, scene.client, confirm=True)
    deal = await reload(ctx, scene.deal.id)
    assert await ledger_total(ctx, deal.id, LedgerKind.REFUNDED) == 2_500_000
    assert await ledger_total(ctx, deal.id, LedgerKind.RELEASED) == 0


async def test_declining_or_withdrawing_changes_nothing(ctx: AppContext) -> None:
    scene = await delivered(ctx)
    proposal = await cancellation.propose(ctx, scene.deal.id, scene.client, "Not sure anymore.")
    with pytest.raises(MoneyError, match="already a cancellation"):
        await cancellation.propose(ctx, scene.deal.id, scene.maker, "Me too.")
    with pytest.raises(MoneyError, match="other party"):
        await cancellation.respond(ctx, proposal.id, scene.client, confirm=True)
    await cancellation.respond(ctx, proposal.id, scene.maker, confirm=False)
    second = await cancellation.propose(ctx, scene.deal.id, scene.client, "Trying again.")
    await cancellation.withdraw(ctx, second.id, scene.client)
    deal = await reload(ctx, scene.deal.id)
    assert deal.status == DealStatus.ACTIVE
    async with ctx.sessions() as session:
        statuses = sorted((await session.execute(select(Cancellation.status))).scalars())
    assert statuses == sorted([ProposalStatus.DECLINED, ProposalStatus.WITHDRAWN])


async def test_cancelling_before_payment_moves_no_money(ctx: AppContext) -> None:
    scene = await accepted(ctx)
    proposal = await cancellation.propose(ctx, scene.deal.id, scene.client, "Found someone in-house.")
    await cancellation.respond(ctx, proposal.id, scene.maker, confirm=True)
    deal = await reload(ctx, scene.deal.id)
    assert deal.status == DealStatus.CANCELLED
    assert all(m.status == MilestoneStatus.CANCELLED for m in deal.milestones)
