import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from tests.factory import accepted, funded, ledger_rows
from vaada.context import AppContext
from vaada.db import transaction
from vaada.models.enums import LedgerKind
from vaada.money import ledger


async def test_ledger_refuses_update_delete_and_truncate(ctx: AppContext) -> None:
    scene = await funded(ctx)
    rows = await ledger_rows(ctx, scene.deal.id)
    assert rows
    for sql in (
        f"UPDATE vaada.ledger_entries SET amount_paise = 1 WHERE id = {rows[0].id}",
        f"DELETE FROM vaada.ledger_entries WHERE id = {rows[0].id}",
        "TRUNCATE vaada.ledger_entries",
    ):
        with pytest.raises(DBAPIError, match="append-only"):
            async with transaction(ctx.sessions) as session:
                await session.execute(text(sql))
    assert len(await ledger_rows(ctx, scene.deal.id)) == len(rows)


async def test_acceptances_are_immutable(ctx: AppContext) -> None:
    scene = await accepted(ctx)
    for sql in (
        f"UPDATE vaada.acceptances SET name_typed = 'Someone Else' WHERE deal_id = '{scene.deal.id}'",
        f"DELETE FROM vaada.acceptances WHERE deal_id = '{scene.deal.id}'",
        "TRUNCATE vaada.acceptances CASCADE",
    ):
        with pytest.raises(DBAPIError, match="append-only"):
            async with transaction(ctx.sessions) as session:
                await session.execute(text(sql))


async def test_recording_the_same_key_twice_is_a_no_op(ctx: AppContext) -> None:
    scene = await accepted(ctx)
    async with transaction(ctx.sessions) as session:
        first = await ledger.record(
            session,
            deal_id=scene.deal.id,
            kind=LedgerKind.CAPTURED,
            amount_paise=100,
            razorpay_object_id="pay_x",
            key="captured:pay_x",
            at=ctx.clock.now(),
        )
        second = await ledger.record(
            session,
            deal_id=scene.deal.id,
            kind=LedgerKind.CAPTURED,
            amount_paise=100,
            razorpay_object_id="pay_x",
            key="captured:pay_x",
            at=ctx.clock.now(),
        )
    assert (first, second) == (True, False)


async def test_ledger_amounts_are_positive(ctx: AppContext) -> None:
    scene = await accepted(ctx)
    async with transaction(ctx.sessions) as session:
        with pytest.raises(ValueError, match="positive"):
            await ledger.record(
                session,
                deal_id=scene.deal.id,
                kind=LedgerKind.REFUNDED,
                amount_paise=-5,
                razorpay_object_id="rfnd_x",
                key="refunded:rfnd_x",
                at=ctx.clock.now(),
            )
