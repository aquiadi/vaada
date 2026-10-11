import asyncio
from typing import Any

import pytest
from sqlalchemy import func, select

from tests.factory import funded, milestone, reload
from vaada import voice
from vaada.context import AppContext
from vaada.models import DealEvent, VoiceUpdate
from vaada.models.enums import MilestoneStatus, VoiceUpdateStatus
from vaada.money.errors import MoneyError


async def notes_logged(ctx: AppContext, deal_id: object, text: str) -> int:
    async with ctx.sessions() as session:
        return int(
            await session.scalar(
                select(func.count())
                .select_from(DealEvent)
                .where(DealEvent.deal_id == deal_id, DealEvent.summary == text)
            )
            or 0
        )


async def stored(ctx: AppContext, update_id: object) -> VoiceUpdate:
    async with ctx.sessions() as session:
        update = await session.get(VoiceUpdate, update_id)
        assert update is not None
        return update


def actions(raw: list[dict[str, Any]]) -> list[voice.Action]:
    return voice.actions_adapter.validate_python(raw)


DELIVER_ONE: dict[str, Any] = {"type": "mark_delivered", "milestone_idx": 1, "note": "final files"}


async def test_a_failure_partway_keeps_what_was_done_and_a_retry_skips_it(ctx: AppContext) -> None:
    scene = await funded(ctx)
    note = {"type": "note", "text": "Call on Thursday"}
    backwards = {"type": "delay", "milestone_idx": 2, "new_date": "2020-01-01", "note": "der ho gayi"}
    update = await voice.record(ctx, scene.deal.id, scene.maker, "done", actions([note, DELIVER_ONE, backwards]))

    with pytest.raises(MoneyError, match="in the future"):
        await voice.apply(ctx, update.id, scene.maker, [0, 1, 2], {})
    after_failure = await stored(ctx, update.id)
    assert after_failure.applied_indexes == [0, 1]
    assert after_failure.status == VoiceUpdateStatus.PROPOSED
    assert milestone(await reload(ctx, scene.deal.id), 1).status == MilestoneStatus.DELIVERED

    assert await voice.apply(ctx, update.id, scene.maker, [0, 1], {}) == []
    assert await notes_logged(ctx, scene.deal.id, "Call on Thursday") == 1
    assert (await stored(ctx, update.id)).status == VoiceUpdateStatus.PARTIALLY_APPLIED


async def test_an_unanswered_question_fails_before_anything_is_applied(ctx: AppContext) -> None:
    scene = await funded(ctx)
    note = {"type": "note", "text": "Sent the drafts"}
    unsure = {"type": "mark_delivered", "milestone_idx": None, "note": ""}
    update = await voice.record(ctx, scene.deal.id, scene.maker, "drafts bhej diye", actions([note, unsure]))

    with pytest.raises(MoneyError, match="Pick which milestone"):
        await voice.apply(ctx, update.id, scene.maker, [0, 1], {})
    assert await notes_logged(ctx, scene.deal.id, "Sent the drafts") == 0

    await voice.apply(ctx, update.id, scene.maker, [0, 1], {1: 1})
    assert milestone(await reload(ctx, scene.deal.id), 1).status == MilestoneStatus.DELIVERED


async def test_two_clicks_apply_an_update_once(ctx: AppContext) -> None:
    scene = await funded(ctx)
    update = await voice.record(ctx, scene.deal.id, scene.maker, "done", actions([DELIVER_ONE]))
    outcomes = await asyncio.gather(
        voice.apply(ctx, update.id, scene.maker, [0], {}),
        voice.apply(ctx, update.id, scene.maker, [0], {}),
        return_exceptions=True,
    )
    assert sum(isinstance(o, list) for o in outcomes) == 1
    refused = [o for o in outcomes if isinstance(o, MoneyError)]
    assert len(refused) == 1 and "already been dealt with" in refused[0].message
