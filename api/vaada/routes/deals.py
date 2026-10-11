import re
import uuid
from datetime import date
from typing import Any

from fastapi import APIRouter, Response
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import or_, select

from vaada import deals, voice
from vaada.deps import Ctx, CurrentUser
from vaada.format import mask_email
from vaada.models import Deal, User
from vaada.models.enums import Confidence
from vaada.money import cancellation, delivery, disputes, refunds
from vaada.money.common import load_deal, role_of
from vaada.money.errors import NotFoundError
from vaada.terms import Draft
from vaada.views import deal_room

router = APIRouter()


class DraftBody(BaseModel):
    draft: Draft
    version: int


class DictationBody(BaseModel):
    field: str = Field(max_length=64)
    kind: str = Field(max_length=16)
    raw: str = Field(max_length=2000)
    value: Any = None
    confidence: Confidence


class CorrectedBody(BaseModel):
    value: Any


EMAIL = re.compile(r"^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$")


class PublishBody(BaseModel):
    client_email: str = Field(max_length=254)

    @field_validator("client_email")
    @classmethod
    def _looks_like_email(cls, v: str) -> str:
        if not EMAIL.match(v.strip()):
            raise ValueError("That doesn't look like an email address. Check it and try again.")
        return v.strip()


class ReasonBody(BaseModel):
    reason: str = Field(min_length=1, max_length=1000)


class NoteBody(BaseModel):
    note: str | None = Field(default=None, max_length=1000)


class ConfirmBody(BaseModel):
    confirm: bool


class DateChangeBody(BaseModel):
    new_due: date
    reason: str = Field(default="", max_length=500)


class VoiceBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    raw_text: str = Field(min_length=1, max_length=2000)
    proposed_actions: list[voice.Action] = Field(max_length=12)


class ApplyBody(BaseModel):
    indexes: list[int]
    milestone_for: dict[int, int] = Field(default_factory=dict)


async def _room(ctx: Ctx, deal_id: uuid.UUID, user: User) -> dict[str, Any]:
    async with ctx.sessions() as session:
        deal = await load_deal(session, deal_id)
        if role_of(deal, user.id) is None:
            raise NotFoundError("That deed")
        await session.refresh(deal, ["milestones"])
    return await deal_room(ctx, deal, user)


@router.get("/deals")
async def list_deals(ctx: Ctx, user: CurrentUser) -> dict[str, Any]:
    async with ctx.sessions() as session:
        rows = (
            (
                await session.execute(
                    select(Deal)
                    .where(or_(Deal.freelancer_id == user.id, Deal.client_id == user.id))
                    .order_by(Deal.updated_at.desc())
                )
            )
            .scalars()
            .all()
        )
    out = []
    for d in rows:
        role = role_of(d, user.id)
        terms = d.terms or {}
        blanks = (d.draft or {}).get("blanks", {})
        client_name = terms.get("client_name") or (blanks.get("client_name") or {}).get("value")
        maker_name = terms.get("maker_name") or (blanks.get("maker_name") or {}).get("value")
        next_due = min((m.due_at for m in d.milestones if m.status.value in ("unfunded", "held")), default=None)
        out.append(
            {
                "id": str(d.id),
                "slug": d.slug,
                "deed_no": d.deed_no,
                "title": d.title or "Untitled draft",
                "status": d.status.value,
                "role": role.value if role else None,
                "counterparty": (client_name if role and role.value == "maker" else maker_name) or None,
                "client_email_masked": mask_email(d.client_email) if d.client_email else None,
                "total_paise": d.total_paise or (blanks.get("total") or {}).get("value"),
                "next_due_at": next_due.isoformat() if next_due else None,
                "updated_at": d.updated_at.isoformat(),
            }
        )
    return {"deals": out}


@router.post("/deals", status_code=201)
async def create_draft(ctx: Ctx, user: CurrentUser) -> dict[str, Any]:
    deal = await deals.blank_draft(ctx, user)
    return await _room(ctx, deal.id, user)


@router.get("/deals/{deal_id}")
async def get_deal(deal_id: uuid.UUID, ctx: Ctx, user: CurrentUser) -> dict[str, Any]:
    return await _room(ctx, deal_id, user)


@router.patch("/deals/{deal_id}")
async def save_draft(deal_id: uuid.UUID, body: DraftBody, ctx: Ctx, user: CurrentUser) -> dict[str, Any]:
    deal = await deals.update_draft(ctx, deal_id, user, body.draft, body.version)
    return {"draft_version": deal.draft_version, "title": deal.title}


@router.delete("/deals/{deal_id}", status_code=204)
async def delete_draft(deal_id: uuid.UUID, ctx: Ctx, user: CurrentUser) -> Response:
    await deals.delete_draft(ctx, deal_id, user)
    return Response(status_code=204)


@router.post("/deals/{deal_id}/dictations", status_code=201)
async def log_dictation(deal_id: uuid.UUID, body: DictationBody, ctx: Ctx, user: CurrentUser) -> dict[str, str]:
    dictation = await deals.log_dictation(
        ctx, deal_id, user, field=body.field, kind=body.kind, raw=body.raw, value=body.value, confidence=body.confidence
    )
    return {"id": str(dictation.id)}


@router.post("/dictations/{dictation_id}/corrected", status_code=204)
async def mark_corrected(dictation_id: uuid.UUID, body: CorrectedBody, ctx: Ctx, user: CurrentUser) -> Response:
    await deals.mark_corrected(ctx, dictation_id, user, body.value)
    return Response(status_code=204)


@router.post("/deals/{deal_id}/publish")
async def publish(deal_id: uuid.UUID, body: PublishBody, ctx: Ctx, user: CurrentUser) -> dict[str, Any]:
    await deals.publish(ctx, deal_id, user, body.client_email)
    return await _room(ctx, deal_id, user)


@router.post("/deals/{deal_id}/resend")
async def resend(deal_id: uuid.UUID, body: PublishBody, ctx: Ctx, user: CurrentUser) -> dict[str, Any]:
    await deals.resend(ctx, deal_id, user, body.client_email)
    return await _room(ctx, deal_id, user)


@router.post("/deals/{deal_id}/withdraw")
async def withdraw(deal_id: uuid.UUID, ctx: Ctx, user: CurrentUser) -> dict[str, Any]:
    await cancellation.withdraw_unaccepted(ctx, deal_id, user)
    return await _room(ctx, deal_id, user)


@router.post("/deals/{deal_id}/reissue", status_code=201)
async def reissue(deal_id: uuid.UUID, ctx: Ctx, user: CurrentUser) -> dict[str, str]:
    fresh = await deals.reissue(ctx, deal_id, user)
    return {"id": str(fresh.id)}


@router.post("/deals/{deal_id}/cancellations", status_code=201)
async def propose_cancellation(deal_id: uuid.UUID, body: ReasonBody, ctx: Ctx, user: CurrentUser) -> dict[str, Any]:
    await cancellation.propose(ctx, deal_id, user, body.reason)
    return await _room(ctx, deal_id, user)


@router.post("/cancellations/{cancellation_id}/respond")
async def respond_cancellation(
    cancellation_id: uuid.UUID, body: ConfirmBody, ctx: Ctx, user: CurrentUser
) -> dict[str, Any]:
    outcomes = await cancellation.respond(ctx, cancellation_id, user, confirm=body.confirm)
    return {"messages": outcomes}


@router.post("/cancellations/{cancellation_id}/withdraw", status_code=204)
async def withdraw_cancellation(cancellation_id: uuid.UUID, ctx: Ctx, user: CurrentUser) -> Response:
    await cancellation.withdraw(ctx, cancellation_id, user)
    return Response(status_code=204)


@router.post("/milestones/{milestone_id}/deliver")
async def deliver(milestone_id: uuid.UUID, body: NoteBody, ctx: Ctx, user: CurrentUser) -> dict[str, Any]:
    milestone = await delivery.deliver(ctx, milestone_id, user, body.note)
    return await _room(ctx, milestone.deal_id, user)


@router.post("/milestones/{milestone_id}/approve")
async def approve(milestone_id: uuid.UUID, ctx: Ctx, user: CurrentUser) -> dict[str, Any]:
    milestone = await delivery.approve(ctx, milestone_id, user)
    return await _room(ctx, milestone.deal_id, user)


@router.post("/milestones/{milestone_id}/refund")
async def request_refund(milestone_id: uuid.UUID, ctx: Ctx, user: CurrentUser) -> dict[str, Any]:
    outcome = await refunds.request_refund(ctx, milestone_id, user)
    return {"completed": outcome.completed, "message": outcome.message}


@router.post("/milestones/{milestone_id}/dispute")
async def open_dispute(milestone_id: uuid.UUID, body: ReasonBody, ctx: Ctx, user: CurrentUser) -> dict[str, Any]:
    dispute = await disputes.open_dispute(ctx, milestone_id, user, body.reason)
    return await _room(ctx, dispute.deal_id, user)


@router.post("/milestones/{milestone_id}/date-changes", status_code=201)
async def propose_date(milestone_id: uuid.UUID, body: DateChangeBody, ctx: Ctx, user: CurrentUser) -> dict[str, Any]:
    change = await deals.propose_date_change(ctx, milestone_id, user, new_due=body.new_due, reason=body.reason)
    return await _room(ctx, change.deal_id, user)


@router.post("/date-changes/{change_id}/respond", status_code=204)
async def respond_date(change_id: uuid.UUID, body: ConfirmBody, ctx: Ctx, user: CurrentUser) -> Response:
    await deals.respond_date_change(ctx, change_id, user, agree=body.confirm)
    return Response(status_code=204)


@router.post("/deals/{deal_id}/voice-updates", status_code=201)
async def record_voice(deal_id: uuid.UUID, body: VoiceBody, ctx: Ctx, user: CurrentUser) -> dict[str, Any]:
    update = await voice.record(ctx, deal_id, user, body.raw_text, body.proposed_actions)
    return {"id": str(update.id)}


@router.post("/voice-updates/{update_id}/apply")
async def apply_voice(update_id: uuid.UUID, body: ApplyBody, ctx: Ctx, user: CurrentUser) -> dict[str, Any]:
    return {"results": await voice.apply(ctx, update_id, user, body.indexes, body.milestone_for)}


@router.post("/voice-updates/{update_id}/dismiss", status_code=204)
async def dismiss_voice(update_id: uuid.UUID, ctx: Ctx, user: CurrentUser) -> Response:
    await voice.dismiss(ctx, update_id, user)
    return Response(status_code=204)
