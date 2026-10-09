from datetime import timedelta

from sqlalchemy import select

from tests.factory import delivered, fake, funded, milestone, reload
from vaada.context import AppContext
from vaada.models import ReconciliationFlag
from vaada.models.enums import FlagKind, MilestoneStatus
from vaada.money import reconciliation


async def _flags(ctx: AppContext) -> list[ReconciliationFlag]:
    async with ctx.sessions() as session:
        return list((await session.execute(select(ReconciliationFlag))).scalars())


async def test_consistent_state_raises_nothing(ctx: AppContext) -> None:
    await delivered(ctx)
    assert await reconciliation.reconcile(ctx) == 0
    assert await _flags(ctx) == []


async def test_drift_is_flagged_and_never_corrected(ctx: AppContext) -> None:
    scene = await funded(ctx)
    m = milestone(scene.deal, 1)
    async with fake(ctx)._store.atomic() as tx:
        transfer = await tx.get("transfer", m.razorpay_transfer_id or "")
        assert transfer is not None
        transfer.update(on_hold=False, settlement_status="pending", released_at=1)
        await tx.put("transfer", transfer["id"], transfer)
    assert await reconciliation.reconcile(ctx) == 1
    flags = await _flags(ctx)
    assert [f.kind for f in flags] == [FlagKind.DRIFT]
    assert "hold lifted" in flags[0].summary
    assert milestone(await reload(ctx, scene.deal.id), 1).status == MilestoneStatus.HELD
    assert await reconciliation.reconcile(ctx) == 0
    assert len(await _flags(ctx)) == 1


async def test_refund_deadline_is_flagged_fourteen_days_ahead(ctx: AppContext) -> None:
    await funded(ctx)
    ctx.clock.advance(timedelta(days=160))  # type: ignore[attr-defined]
    assert await reconciliation.reconcile(ctx) == 0
    ctx.clock.advance(timedelta(days=2))  # type: ignore[attr-defined]
    await reconciliation.reconcile(ctx)
    kinds = [f.kind for f in await _flags(ctx)]
    assert FlagKind.REFUND_DEADLINE in kinds
