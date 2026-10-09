import asyncio
from datetime import timedelta

import pytest
from sqlalchemy import select

from tests.factory import Part, fake, funded, ledger_rows, ledger_total, milestone, pump, reload
from vaada.context import AppContext
from vaada.models import ReconciliationFlag
from vaada.models.enums import FlagKind, LedgerKind, MilestoneStatus
from vaada.money import refunds
from vaada.money.errors import MoneyError
from vaada.money.gateway import GatewayRejectedError, GatewayUnavailableError


async def _past_grace(ctx: AppContext, scene_deal: object, idx: int = 1) -> None:
    m = milestone(scene_deal, idx)  # type: ignore[arg-type]
    ctx.clock.set(m.due_at + timedelta(days=3, seconds=1))  # type: ignore[attr-defined]


async def test_refund_opens_only_after_due_date_plus_grace(ctx: AppContext) -> None:
    scene = await funded(ctx)
    m = milestone(scene.deal, 1)
    ctx.clock.set(m.due_at + timedelta(days=2))  # type: ignore[attr-defined]
    with pytest.raises(MoneyError, match="You can ask for this money back from"):
        await refunds.request_refund(ctx, m.id, scene.client)


async def test_refund_reverses_the_transfer_then_refunds_the_payment(ctx: AppContext) -> None:
    scene = await funded(ctx)
    m = milestone(scene.deal, 1)
    balance_before = await fake(ctx).merchant_balance()
    await _past_grace(ctx, scene.deal)
    outcome = await refunds.request_refund(ctx, m.id, scene.client)
    assert outcome.completed
    deal = await reload(ctx, scene.deal.id)
    assert milestone(deal, 1).status == MilestoneStatus.REFUNDED
    transfer = await fake(ctx).fetch_transfer(m.razorpay_transfer_id or "")
    assert transfer.amount_reversed_paise == m.transfer_paise
    assert await ledger_total(ctx, deal.id, LedgerKind.REVERSED) == m.transfer_paise
    assert await ledger_total(ctx, deal.id, LedgerKind.REFUNDED) == m.amount_paise
    assert await fake(ctx).merchant_balance() == balance_before
    payment = await fake(ctx).fetch_payment(transfer.source or "")
    assert payment.amount_paise == 2_560_500


async def test_processing_fee_is_never_refunded(ctx: AppContext) -> None:
    scene = await funded(ctx)
    for idx in (1, 2):
        await _past_grace(ctx, scene.deal, idx)
        await refunds.request_refund(ctx, milestone(scene.deal, idx).id, scene.client)
    deal = await reload(ctx, scene.deal.id)
    assert await ledger_total(ctx, deal.id, LedgerKind.REFUNDED) == 2_500_000
    assert await ledger_total(ctx, deal.id, LedgerKind.FEE_RETAINED) == 60_500
    assert await ledger_total(ctx, deal.id, LedgerKind.FEE_RETURNED) == 0


async def test_a_refund_whose_second_step_fails_waits_in_the_admin_queue(ctx: AppContext) -> None:
    scene = await funded(ctx)
    m = milestone(scene.deal, 1)
    await _past_grace(ctx, scene.deal)
    fake(ctx).fail_next("refund_payment", GatewayUnavailableError("502 from Razorpay"))
    outcome = await refunds.request_refund(ctx, m.id, scene.client)
    assert not outcome.completed
    deal = await reload(ctx, scene.deal.id)
    assert milestone(deal, 1).status == MilestoneStatus.REFUND_REQUESTED
    assert await ledger_total(ctx, deal.id, LedgerKind.REVERSED) == m.transfer_paise
    assert await ledger_total(ctx, deal.id, LedgerKind.REFUNDED) == 0
    async with ctx.sessions() as session:
        flag = (await session.execute(select(ReconciliationFlag))).scalar_one()
    assert flag.kind == FlagKind.REFUND_STUCK and flag.resolved_at is None
    assert [s.id for s in await refunds.stuck_refunds(ctx)] == [m.id]

    outcome = await refunds.retry_refund(ctx, m.id)
    assert outcome.completed
    transfer = await fake(ctx).fetch_transfer(m.razorpay_transfer_id or "")
    assert transfer.amount_reversed_paise == m.transfer_paise
    assert len([r for r in await ledger_rows(ctx, deal.id) if r.kind == LedgerKind.REVERSED]) == 1
    assert await ledger_total(ctx, deal.id, LedgerKind.REFUNDED) == m.amount_paise
    async with ctx.sessions() as session:
        flag = (await session.execute(select(ReconciliationFlag))).scalar_one()
    assert flag.resolved_at is not None


async def test_a_failed_reversal_moves_nothing(ctx: AppContext) -> None:
    scene = await funded(ctx)
    m = milestone(scene.deal, 1)
    await _past_grace(ctx, scene.deal)
    fake(ctx).fail_next("reverse_transfer", GatewayRejectedError("Insufficient balance"))
    with pytest.raises(MoneyError, match="nothing has moved"):
        await refunds.request_refund(ctx, m.id, scene.client)
    assert await ledger_total(ctx, scene.deal.id, LedgerKind.REVERSED) == 0
    outcome = await refunds.retry_refund(ctx, m.id)
    assert outcome.completed


async def test_double_clicked_refund_refunds_once(ctx: AppContext) -> None:
    scene = await funded(ctx)
    m = milestone(scene.deal, 1)
    await _past_grace(ctx, scene.deal)
    await asyncio.gather(*(refunds.request_refund(ctx, m.id, scene.client) for _ in range(4)))
    rows = await ledger_rows(ctx, scene.deal.id)
    assert len([r for r in rows if r.kind == LedgerKind.REFUNDED]) == 1
    assert len([r for r in rows if r.kind == LedgerKind.REVERSED]) == 1
    async with fake(ctx)._store.atomic() as tx:
        assert len(await tx.all("refund")) == 1
        assert len(await tx.all("reversal")) == 1


async def test_refund_failed_webhook_reopens_the_refund_with_a_new_key(ctx: AppContext) -> None:
    import json

    scene = await funded(ctx)
    m = milestone(scene.deal, 1)
    await _past_grace(ctx, scene.deal)
    await refunds.request_refund(ctx, m.id, scene.client)
    async with fake(ctx)._store.atomic() as tx:
        refund = (await tx.all("refund"))[0]
    body = json.dumps(
        {"entity": "event", "event": "refund.failed", "account_id": "acc_x", "contains": ["refund"],
         "payload": {"refund": {"entity": {**refund, "status": "failed"}}}, "created_at": 1},
        separators=(",", ":"),
    ).encode()
    from vaada.money import webhooks

    await webhooks.ingest(ctx, body, fake(ctx)._sign(ctx.settings.fake_gateway_webhook_secret, body), "evt_refund_failed")
    await webhooks.process_pending(ctx)
    deal = await reload(ctx, scene.deal.id)
    assert milestone(deal, 1).status == MilestoneStatus.REFUND_REQUESTED
    assert (milestone(deal, 1).refund_intent or {}).get("attempt") == 1
    assert await ledger_total(ctx, deal.id, LedgerKind.REFUND_FAILED) == m.amount_paise


@pytest.mark.parametrize("settings_overrides", [{"platform_fee_bps": 500}])
async def test_refund_returns_the_platform_fee_kept_from_that_milestone(ctx: AppContext) -> None:
    scene = await funded(ctx, [Part(1_000_000, 10), Part(1_000_000, 20)])
    m = milestone(scene.deal, 1)
    assert m.platform_fee_paise == 50_000
    await _past_grace(ctx, scene.deal)
    await refunds.request_refund(ctx, m.id, scene.client)
    assert await ledger_total(ctx, scene.deal.id, LedgerKind.REVERSED) == 950_000
    assert await ledger_total(ctx, scene.deal.id, LedgerKind.FEE_RETURNED) == 50_000
    assert await ledger_total(ctx, scene.deal.id, LedgerKind.REFUNDED) == 1_000_000
    await pump(ctx)
