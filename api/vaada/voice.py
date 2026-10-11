"""Voice updates: the browser's rule-based interpreter proposes actions; nothing happens until a person
applies them here, and money actions go through the same paths as the buttons."""

import uuid
from datetime import date
from typing import Annotated, Literal

from pydantic import BaseModel, Field, TypeAdapter

from vaada import deals, register
from vaada.context import AppContext
from vaada.db import transaction
from vaada.format import roman
from vaada.models import Milestone, User, VoiceUpdate
from vaada.models.enums import MilestoneStatus, Role, VoiceUpdateStatus
from vaada.money import delivery
from vaada.money.common import load_deal, require_role
from vaada.money.errors import MoneyError, NotFoundError


class MarkDelivered(BaseModel):
    type: Literal["mark_delivered"]
    milestone_idx: int | None = None
    note: Annotated[str, Field(max_length=1000)] = ""


class LogRevision(BaseModel):
    type: Literal["log_revision"]
    milestone_idx: int | None = None
    note: Annotated[str, Field(max_length=1000)] = ""


class Delay(BaseModel):
    type: Literal["delay"]
    milestone_idx: int | None = None
    new_date: date | None = None
    note: Annotated[str, Field(max_length=500)] = ""


class Note(BaseModel):
    type: Literal["note"]
    text: Annotated[str, Field(min_length=1, max_length=1000)]


Action = Annotated[MarkDelivered | LogRevision | Delay | Note, Field(discriminator="type")]
actions_adapter: TypeAdapter[list[Action]] = TypeAdapter(list[Action])


def ordinal(n: int) -> str:
    suffix = "th" if 11 <= n % 100 <= 13 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suffix}"


async def record(ctx: AppContext, deal_id: uuid.UUID, user: User, raw_text: str, actions: list[Action]) -> VoiceUpdate:
    raw_text = raw_text.strip()
    if not raw_text:
        raise MoneyError("Say or type what happened first.", status_code=422)
    async with transaction(ctx.sessions) as session:
        deal = await load_deal(session, deal_id)
        require_role(deal, user.id, Role.MAKER, Role.CLIENT)
        update = VoiceUpdate(
            deal_id=deal.id,
            user_id=user.id,
            raw_text=raw_text[:2000],
            proposed_actions=[a.model_dump(mode="json") for a in actions],
        )
        session.add(update)
        await session.flush()
        return update


async def dismiss(ctx: AppContext, update_id: uuid.UUID, user: User) -> None:
    async with transaction(ctx.sessions) as session:
        update = await session.get(VoiceUpdate, update_id, with_for_update=True)
        if update is None or update.user_id != user.id:
            raise NotFoundError("That update")
        update.status = VoiceUpdateStatus.DISMISSED
        update.resolved_at = ctx.clock.now()


async def apply(
    ctx: AppContext, update_id: uuid.UUID, user: User, indexes: list[int], overrides: dict[int, int]
) -> list[str]:
    """Applies the chosen actions in order. `overrides` answers "which milestone?" for ambiguous cards.

    The update's row stays locked throughout, so two clicks can't both apply it. Each action that succeeds is
    recorded; if a later one fails, the update stays open and a retry skips what was already done.
    """
    async with ctx.sessions() as session, session.begin():
        update = await session.get(VoiceUpdate, update_id, with_for_update=True)
        if update is None or update.user_id != user.id:
            raise NotFoundError("That update")
        if update.status != VoiceUpdateStatus.PROPOSED:
            raise MoneyError("This update has already been dealt with.")
        deal = await load_deal(session, update.deal_id)
        role = require_role(deal, user.id, Role.MAKER, Role.CLIENT)
        actions = actions_adapter.validate_python(update.proposed_actions)
        chosen = sorted(set(indexes))
        plan = [_resolve(actions, index, overrides, deal.milestones) for index in chosen]
        done = list(update.applied_indexes)
        results: list[str] = []
        failure: MoneyError | None = None
        for index, (action, milestone) in zip(chosen, plan, strict=True):
            if index in done:
                continue
            try:
                results.append(await _apply_one(ctx, deal.id, user, role, action, milestone))
            except MoneyError as exc:
                failure = exc
                break
            done.append(index)
        update.applied_indexes = sorted(done)
        if failure is None:
            update.status = (
                VoiceUpdateStatus.APPLIED if len(chosen) == len(actions) else VoiceUpdateStatus.PARTIALLY_APPLIED
            )
            update.resolved_at = ctx.clock.now()
    if failure is not None:
        raise failure
    return results


def _resolve(
    actions: list[Action], index: int, overrides: dict[int, int], milestones: list[Milestone]
) -> tuple[Action, Milestone | None]:
    """Checks a chosen action before anything is applied, so a bad choice fails with nothing done."""
    if not 0 <= index < len(actions):
        raise MoneyError("That action isn't part of this update.", status_code=422)
    action = actions[index]
    idx = overrides.get(index, getattr(action, "milestone_idx", None))
    milestone = next((m for m in milestones if m.idx == idx), None) if idx else None
    if isinstance(action, MarkDelivered) and milestone is None:
        raise MoneyError("Pick which milestone was delivered.", status_code=422)
    if isinstance(action, Delay) and milestone is None:
        raise MoneyError("Pick which milestone is running late.", status_code=422)
    return action, milestone


async def _apply_one(
    ctx: AppContext, deal_id: uuid.UUID, user: User, role: Role, action: Action, milestone: Milestone | None
) -> str:
    if isinstance(action, MarkDelivered) and milestone is not None:
        await delivery.deliver(ctx, milestone.id, user, action.note or None)
        return f"Milestone {roman(milestone.idx)} marked delivered."
    if isinstance(action, LogRevision):
        return await _log_revision(ctx, deal_id, user, role, milestone.idx if milestone else None, action.note)
    if isinstance(action, Delay) and milestone is not None:
        if action.new_date is not None:
            await deals.propose_date_change(ctx, milestone.id, user, new_due=action.new_date, reason=action.note)
            return f"Asked to move milestone {roman(milestone.idx)}. It changes only if the other party agrees."
        async with transaction(ctx.sessions) as session:
            await register.log(
                session,
                deal_id=deal_id,
                milestone_id=milestone.id,
                kind="note",
                role=role,
                actor_id=user.id,
                at=ctx.clock.now(),
                summary=f"Flagged a delay on milestone {roman(milestone.idx)}: “{action.note}”",
            )
        return "Delay noted in the register."
    assert isinstance(action, Note)
    async with transaction(ctx.sessions) as session:
        await register.log(
            session,
            deal_id=deal_id,
            kind="note",
            role=role,
            actor_id=user.id,
            at=ctx.clock.now(),
            summary=action.text[:500],
        )
    return "Noted in the register."


async def _log_revision(ctx: AppContext, deal_id: uuid.UUID, user: User, role: Role, idx: int | None, note: str) -> str:
    async with transaction(ctx.sessions) as session:
        deal = await load_deal(session, deal_id, lock=True)
        target = next((m for m in deal.milestones if m.idx == idx), None) or next(
            (m for m in deal.milestones if m.status in (MilestoneStatus.HELD, MilestoneStatus.DELIVERED)),
            deal.milestones[-1],
        )
        target.revisions_logged += 1
        used = sum(m.revisions_logged for m in deal.milestones)
        allowed = (deal.terms or {}).get("revisions")
        over = isinstance(allowed, int) and used > allowed
        summary = (
            f"Revision requested ({ordinal(used)}): “{note}”" if note else f"Revision requested ({ordinal(used)})."
        )
        if over:
            summary += f" The deed covers {allowed}."
        await register.log(
            session,
            deal_id=deal.id,
            milestone_id=target.id,
            kind="revision",
            role=role,
            actor_id=user.id,
            at=ctx.clock.now(),
            summary=summary,
        )
        return summary
