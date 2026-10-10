import asyncio

import pytest
from sqlalchemy import func, select

from tests.factory import (
    Part,
    accepted,
    fake,
    funded,
    ledger_rows,
    ledger_total,
    milestone,
    pump,
    reload,
    resend_everything,
)
from vaada import deals
from vaada.context import AppContext
from vaada.models import Payment, ReconciliationFlag, RegistryRecord, WebhookEvent
from vaada.models.enums import DealStatus, FlagKind, LedgerKind, MilestoneStatus, PaymentStatus, RegistryKind
from vaada.money import funding, webhooks
from vaada.money.errors import MoneyError


async def test_order_carries_one_held_transfer_per_milestone(ctx: AppContext) -> None:
    scene = await accepted(ctx)
    config = await funding.create_order(ctx, scene.deal.id, scene.client)
    assert config.amount_paise == 2_500_000 + 60_500
    assert config.upi_allowed
    async with fake(ctx)._store.atomic() as tx:
        order = await tx.get("order", config.order_id)
    assert order is not None
    assert [t["amount"] for t in order["transfers"]] == [1_250_000, 1_250_000]
    assert all(t["on_hold"] for t in order["transfers"])
    assert {t["notes"]["milestone_idx"] for t in order["transfers"]} == {"1", "2"}


async def test_happy_path_holds_every_milestone_and_writes_the_ledger(ctx: AppContext) -> None:
    scene = await funded(ctx)
    deal = scene.deal
    assert deal.status == DealStatus.FUNDED
    assert all(m.status == MilestoneStatus.HELD and m.razorpay_transfer_id for m in deal.milestones)
    kinds = [r.kind for r in await ledger_rows(ctx, deal.id)]
    assert kinds.count(LedgerKind.CAPTURED) == 1
    assert kinds.count(LedgerKind.HELD) == 2
    assert await ledger_total(ctx, deal.id, LedgerKind.CAPTURED) == 2_560_500
    assert await ledger_total(ctx, deal.id, LedgerKind.FEE_RETAINED) == 60_500
    assert await ledger_total(ctx, deal.id, LedgerKind.HELD) == 2_500_000
    async with ctx.sessions() as session:
        kinds_queued = set(
            (await session.execute(select(RegistryRecord.kind).where(RegistryRecord.deal_id == deal.id))).scalars()
        )
    assert kinds_queued == {RegistryKind.PUBLISHED, RegistryKind.ACCEPTED, RegistryKind.FUNDED}


async def test_ledger_balances_at_capture(ctx: AppContext) -> None:
    scene = await funded(ctx)
    deal_id = scene.deal.id
    captured = await ledger_total(ctx, deal_id, LedgerKind.CAPTURED)
    held = await ledger_total(ctx, deal_id, LedgerKind.HELD)
    retained = await ledger_total(ctx, deal_id, LedgerKind.FEE_RETAINED)
    tds = await ledger_total(ctx, deal_id, LedgerKind.TDS_WITHHELD)
    assert captured == held + retained + tds


@pytest.mark.parametrize("settings_overrides", [{"platform_fee_bps": 500, "tds_bps": 100}])
async def test_platform_fee_and_tds_stay_with_the_platform(ctx: AppContext) -> None:
    scene = await funded(ctx, [Part(1_000_001, 10), Part(999_999, 20)])
    deal = scene.deal
    total = 2_000_000
    assert sum(m.platform_fee_paise for m in deal.milestones) == total * 500 // 10_000
    assert sum(m.tds_paise for m in deal.milestones) == total * 100 // 10_000
    assert await ledger_total(ctx, deal.id, LedgerKind.HELD) == sum(m.transfer_paise for m in deal.milestones)
    assert await ledger_total(ctx, deal.id, LedgerKind.TDS_WITHHELD) == 20_000
    captured = await ledger_total(ctx, deal.id, LedgerKind.CAPTURED)
    assert captured == (
        await ledger_total(ctx, deal.id, LedgerKind.HELD)
        + await ledger_total(ctx, deal.id, LedgerKind.FEE_RETAINED)
        + await ledger_total(ctx, deal.id, LedgerKind.TDS_WITHHELD)
    )


async def test_duplicate_webhooks_change_nothing(ctx: AppContext) -> None:
    scene = await accepted(ctx)
    config = await funding.create_order(ctx, scene.deal.id, scene.client)
    await fake(ctx).simulate_checkout(config.order_id)
    await pump(ctx, duplicate=True)
    first = [(r.kind, r.amount_paise) for r in await ledger_rows(ctx, scene.deal.id)]
    await resend_everything(ctx)
    await webhooks.process_pending(ctx)
    assert [(r.kind, r.amount_paise) for r in await ledger_rows(ctx, scene.deal.id)] == first


async def test_replaying_processed_events_changes_nothing(ctx: AppContext) -> None:
    scene = await funded(ctx)
    before = [(r.kind, r.amount_paise, r.idempotency_key) for r in await ledger_rows(ctx, scene.deal.id)]
    async with ctx.sessions() as session:
        event_ids = (await session.execute(select(WebhookEvent.event_id))).scalars().all()
    assert event_ids
    for event_id in event_ids:
        assert await webhooks.replay(ctx, event_id)
    assert [(r.kind, r.amount_paise, r.idempotency_key) for r in await ledger_rows(ctx, scene.deal.id)] == before


async def test_out_of_order_webhooks_end_in_the_same_state(ctx: AppContext) -> None:
    scene = await accepted(ctx)
    config = await funding.create_order(ctx, scene.deal.id, scene.client)
    await fake(ctx).simulate_checkout(config.order_id)
    await pump(ctx, order="reverse")
    deal = await reload(ctx, scene.deal.id)
    assert deal.status == DealStatus.FUNDED
    assert all(m.status == MilestoneStatus.HELD for m in deal.milestones)
    assert await ledger_total(ctx, deal.id, LedgerKind.HELD) == 2_500_000


async def test_transfer_webhook_alone_holds_its_milestone_but_does_not_fund(ctx: AppContext) -> None:
    scene = await accepted(ctx)
    config = await funding.create_order(ctx, scene.deal.id, scene.client)
    await fake(ctx).simulate_checkout(config.order_id)
    deliveries = await fake(ctx).due_deliveries()
    first_transfer = next(d for d in deliveries if d.event_type == "transfer.processed")
    await webhooks.ingest(ctx, first_transfer.body, first_transfer.signature, first_transfer.event_id)
    await webhooks.process_pending(ctx)
    deal = await reload(ctx, scene.deal.id)
    assert deal.status == DealStatus.ACCEPTED
    assert sorted(m.status for m in deal.milestones) == sorted([MilestoneStatus.HELD, MilestoneStatus.UNFUNDED])


async def test_a_bad_webhook_signature_is_refused(ctx: AppContext) -> None:
    with pytest.raises(webhooks.WebhookRejectedError):
        await webhooks.ingest(ctx, b'{"event":"payment.captured"}', "deadbeef", "evt_forged")
    with pytest.raises(webhooks.WebhookRejectedError):
        await webhooks.ingest(ctx, b'{"event":"payment.captured"}', None, "evt_forged")


async def test_checkout_return_needs_a_valid_signature_and_moves_no_money(ctx: AppContext) -> None:
    scene = await accepted(ctx)
    config = await funding.create_order(ctx, scene.deal.id, scene.client)
    response = await fake(ctx).simulate_checkout(config.order_id)
    with pytest.raises(MoneyError, match="didn't check out"):
        await funding.record_checkout_return(
            ctx,
            scene.deal.id,
            scene.client,
            order_id=config.order_id,
            payment_id=response["razorpay_payment_id"],
            signature="0" * 64,
        )
    await funding.record_checkout_return(
        ctx,
        scene.deal.id,
        scene.client,
        order_id=config.order_id,
        payment_id=response["razorpay_payment_id"],
        signature=response["razorpay_signature"],
    )
    deal = await reload(ctx, scene.deal.id)
    assert deal.status == DealStatus.ACCEPTED
    assert await ledger_rows(ctx, deal.id) == []
    async with ctx.sessions() as session:
        payment = (await session.execute(select(Payment).where(Payment.deal_id == deal.id))).scalar_one()
    assert payment.status == PaymentStatus.AUTHORIZED


async def test_double_clicked_pay_button_opens_one_order(ctx: AppContext) -> None:
    scene = await accepted(ctx)
    configs = await asyncio.gather(*(funding.create_order(ctx, scene.deal.id, scene.client) for _ in range(4)))
    assert len({c.order_id for c in configs}) == 1
    async with ctx.sessions() as session:
        count = await session.scalar(select(func.count()).select_from(Payment).where(Payment.deal_id == scene.deal.id))
    assert count == 1


async def test_only_the_client_can_open_the_order(ctx: AppContext) -> None:
    scene = await accepted(ctx)
    with pytest.raises(MoneyError, match="Only the Client"):
        await funding.create_order(ctx, scene.deal.id, scene.maker)


async def test_upi_is_left_out_above_the_limit(ctx: AppContext) -> None:
    scene = await accepted(ctx, [Part(6_000_000, 10), Part(6_000_000, 20)])
    config = await funding.create_order(ctx, scene.deal.id, scene.client)
    assert not config.upi_allowed
    assert config.options["method"]["upi"] is False
    assert config.options["config"]["display"]["sequence"][0] == "block.netbanking"
    assert {"method": "upi"} in config.options["config"]["display"]["hide"]


async def test_checkout_offers_only_methods_whose_fee_fits(ctx: AppContext) -> None:
    scene = await accepted(ctx)
    config = await funding.create_order(ctx, scene.deal.id, scene.client)
    method = config.options["method"]
    assert method == {
        "upi": True,
        "netbanking": True,
        "card": True,
        "wallet": False,
        "emi": False,
        "paylater": False,
        "cardless_emi": False,
    }
    cards = config.options["config"]["display"]["blocks"]["cards"]["instruments"][0]
    assert set(cards["networks"]) == {"Visa", "MasterCard", "RuPay"}


async def test_a_transfer_that_fails_for_insufficient_balance_is_flagged(ctx: AppContext) -> None:
    scene = await accepted(ctx)
    config = await funding.create_order(ctx, scene.deal.id, scene.client)
    fake(ctx).fee_bps = 400
    await fake(ctx).simulate_checkout(config.order_id)
    await pump(ctx)
    deal = await reload(ctx, scene.deal.id)
    assert deal.status == DealStatus.ACCEPTED
    assert milestone(deal, 1).status == MilestoneStatus.HELD
    assert milestone(deal, 2).status == MilestoneStatus.UNFUNDED
    assert await ledger_total(ctx, deal.id, LedgerKind.TRANSFER_FAILED) == 1_250_000
    async with ctx.sessions() as session:
        flags = (
            (await session.execute(select(ReconciliationFlag).where(ReconciliationFlag.deal_id == deal.id)))
            .scalars()
            .all()
        )
    assert {f.kind for f in flags} >= {FlagKind.TRANSFER_FAILED, FlagKind.FEE_EXCEEDED}


async def test_misconfigured_fees_refuse_the_order_before_the_client_pays(ctx: AppContext) -> None:
    scene = await accepted(ctx)
    ctx.settings.gateway_fee_bps = 300
    with pytest.raises(MoneyError) as raised:
        await funding.create_order(ctx, scene.deal.id, scene.client)
    assert raised.value.code == "fee_misconfigured"
    async with fake(ctx)._store.atomic() as tx:
        assert await tx.all("order") == []


async def test_payment_after_the_pay_by_date_is_refused(ctx: AppContext) -> None:
    from datetime import timedelta

    scene = await accepted(ctx)
    ctx.clock.advance(timedelta(days=8))  # type: ignore[attr-defined]
    with pytest.raises(MoneyError, match="time to pay"):
        await funding.create_order(ctx, scene.deal.id, scene.client)


async def test_a_failed_payment_moves_no_money_and_can_be_retried(ctx: AppContext) -> None:
    from vaada.money.gateway import GatewayRejectedError

    scene = await accepted(ctx)
    config = await funding.create_order(ctx, scene.deal.id, scene.client)
    with pytest.raises(GatewayRejectedError):
        await fake(ctx).simulate_checkout(config.order_id, succeed=False)
    await pump(ctx)
    assert await ledger_rows(ctx, scene.deal.id) == []
    again = await funding.create_order(ctx, scene.deal.id, scene.client)
    assert again.order_id == config.order_id
    await fake(ctx).simulate_checkout(again.order_id)
    await pump(ctx)
    assert (await reload(ctx, scene.deal.id)).status == DealStatus.FUNDED


async def test_lapsing_spares_a_deal_with_a_payment_in_flight(ctx: AppContext) -> None:
    from datetime import timedelta

    paying = await accepted(ctx)
    config = await funding.create_order(ctx, paying.deal.id, paying.client)
    response = await fake(ctx).simulate_checkout(config.order_id)
    await funding.record_checkout_return(
        ctx,
        paying.deal.id,
        paying.client,
        order_id=config.order_id,
        payment_id=response["razorpay_payment_id"],
        signature=response["razorpay_signature"],
    )
    idle = await accepted(ctx)
    ctx.clock.advance(timedelta(days=8))  # type: ignore[attr-defined]
    assert await deals.lapse_overdue(ctx) == 1
    assert (await reload(ctx, idle.deal.id)).status == DealStatus.LAPSED
    assert (await reload(ctx, paying.deal.id)).status == DealStatus.ACCEPTED
    await pump(ctx)
    assert (await reload(ctx, paying.deal.id)).status == DealStatus.FUNDED
