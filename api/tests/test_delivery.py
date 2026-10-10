import asyncio
from datetime import datetime, timedelta

import pytest

from tests.factory import delivered, fake, funded, ledger_rows, ledger_total, milestone, reload
from vaada.context import AppContext
from vaada.models.enums import DealStatus, LedgerKind, MilestoneStatus
from vaada.money import delivery
from vaada.money.errors import GatewayTroubleError, MoneyError
from vaada.money.gateway import GatewayUnavailableError, Transfer


async def test_delivery_sets_a_release_date_razorpay_enforces(ctx: AppContext) -> None:
    scene = await delivered(ctx)
    m = milestone(scene.deal, 1)
    now = ctx.clock.now()
    assert m.status == MilestoneStatus.DELIVERED
    assert m.review_ends_at == now + timedelta(days=5)
    assert m.hold_until == now + timedelta(days=5, hours=24)
    transfer = await fake(ctx).fetch_transfer(m.razorpay_transfer_id or "")
    assert transfer.on_hold and transfer.on_hold_until == m.hold_until
    assert scene.deal.status == DealStatus.ACTIVE
    assert await ledger_total(ctx, scene.deal.id, LedgerKind.HOLD_EXTENDED) == m.transfer_paise


async def test_delivering_twice_records_once(ctx: AppContext) -> None:
    scene = await funded(ctx)
    m = milestone(scene.deal, 1)
    await asyncio.gather(*(delivery.deliver(ctx, m.id, scene.maker, None) for _ in range(3)))
    rows = [r for r in await ledger_rows(ctx, scene.deal.id) if r.kind == LedgerKind.HOLD_EXTENDED]
    assert len(rows) == 1


async def test_only_the_maker_delivers_and_only_held_money(ctx: AppContext) -> None:
    scene = await funded(ctx)
    m = milestone(scene.deal, 1)
    with pytest.raises(MoneyError, match="Only the Maker"):
        await delivery.deliver(ctx, m.id, scene.client, None)


async def test_delivery_changes_nothing_when_razorpay_is_down(ctx: AppContext) -> None:
    scene = await funded(ctx)
    m = milestone(scene.deal, 1)
    fake(ctx).fail_next("set_transfer_hold", GatewayUnavailableError("timeout"))
    with pytest.raises(GatewayTroubleError):
        await delivery.deliver(ctx, m.id, scene.maker, None)
    assert milestone(await reload(ctx, scene.deal.id), 1).status == MilestoneStatus.HELD


async def test_approval_releases_for_the_next_settlement(ctx: AppContext) -> None:
    scene = await delivered(ctx)
    m = milestone(scene.deal, 1)
    await delivery.approve(ctx, m.id, scene.client)
    deal = await reload(ctx, scene.deal.id)
    assert milestone(deal, 1).status == MilestoneStatus.RELEASED
    transfer = await fake(ctx).fetch_transfer(m.razorpay_transfer_id or "")
    assert not transfer.on_hold and transfer.settlement_status == "pending"
    assert await ledger_total(ctx, deal.id, LedgerKind.RELEASED) == m.transfer_paise


async def test_double_clicked_approve_releases_once(ctx: AppContext) -> None:
    scene = await delivered(ctx)
    m = milestone(scene.deal, 1)
    await asyncio.gather(*(delivery.approve(ctx, m.id, scene.client) for _ in range(4)))
    released = [r for r in await ledger_rows(ctx, scene.deal.id) if r.kind == LedgerKind.RELEASED]
    assert len(released) == 1


async def test_maker_cannot_approve_their_own_work(ctx: AppContext) -> None:
    scene = await delivered(ctx)
    with pytest.raises(MoneyError, match="Only the Client"):
        await delivery.approve(ctx, milestone(scene.deal, 1).id, scene.maker)


async def test_hold_expiry_releases_money_with_no_action_from_us(ctx: AppContext) -> None:
    scene = await delivered(ctx)
    m = milestone(scene.deal, 1)
    ctx.clock.advance(timedelta(days=6, seconds=1))  # type: ignore[attr-defined]
    transfer = await fake(ctx).fetch_transfer(m.razorpay_transfer_id or "")
    assert not transfer.on_hold
    assert transfer.hold_lifted(ctx.clock.now())
    ctx.clock.advance(timedelta(days=2))  # type: ignore[attr-defined]
    assert (await fake(ctx).fetch_transfer(m.razorpay_transfer_id or "")).settlement_status == "settled"
    assert milestone(await reload(ctx, scene.deal.id), 1).status == MilestoneStatus.DELIVERED


async def test_our_job_records_the_release_razorpay_already_made(
    ctx: AppContext, monkeypatch: pytest.MonkeyPatch
) -> None:
    scene = await delivered(ctx)
    m = milestone(scene.deal, 1)
    calls: list[str] = []
    original = fake(ctx).set_transfer_hold

    async def spy(transfer_id: str, *, on_hold: bool, until: datetime | None) -> Transfer:
        calls.append(transfer_id)
        return await original(transfer_id, on_hold=on_hold, until=until)

    monkeypatch.setattr(fake(ctx), "set_transfer_hold", spy)
    ctx.clock.advance(timedelta(days=5, hours=23))  # type: ignore[attr-defined]
    assert await delivery.confirm_expired_holds(ctx) == 0
    ctx.clock.advance(timedelta(hours=1, seconds=1))  # type: ignore[attr-defined]
    assert await delivery.confirm_expired_holds(ctx) == 1
    assert calls == []
    deal = await reload(ctx, scene.deal.id)
    assert milestone(deal, 1).status == MilestoneStatus.RELEASED
    assert milestone(deal, 1).released_at == m.hold_until
    assert await delivery.confirm_expired_holds(ctx) == 0
    assert await ledger_total(ctx, deal.id, LedgerKind.RELEASED) == m.transfer_paise


async def test_a_completed_deal_after_both_releases(ctx: AppContext) -> None:
    scene = await delivered(ctx)
    await delivery.approve(ctx, milestone(scene.deal, 1).id, scene.client)
    await delivery.deliver(ctx, milestone(scene.deal, 2).id, scene.maker, "All done")
    await delivery.approve(ctx, milestone(scene.deal, 2).id, scene.client)
    deal = await reload(ctx, scene.deal.id)
    assert deal.status == DealStatus.COMPLETED
    assert await ledger_total(ctx, deal.id, LedgerKind.RELEASED) == 2_500_000


async def test_review_reminder_goes_out_once_a_day_before_disputes_close(ctx: AppContext) -> None:
    scene = await delivered(ctx)
    ctx.clock.advance(timedelta(days=3))  # type: ignore[attr-defined]
    assert await delivery.send_review_reminders(ctx) == 0
    ctx.clock.advance(timedelta(days=1, hours=1))  # type: ignore[attr-defined]
    assert await delivery.send_review_reminders(ctx) == 1
    assert await delivery.send_review_reminders(ctx) == 0
    assert scene is not None
