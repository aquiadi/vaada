"""The admin queue: disputes by refund deadline, drift, failed transfers, stuck refunds, failed registry
writes and payout accounts that need a look. Gated on ADMIN_EMAILS."""

import uuid
from datetime import timedelta
from typing import Any

from fastapi import APIRouter, Response
from pydantic import BaseModel, Field
from sqlalchemy import select

from vaada.db import transaction
from vaada.deps import AdminUser, Ctx
from vaada.format import deed_number
from vaada.models import (
    Deal,
    Dictation,
    Dispute,
    Milestone,
    Payment,
    PayoutAccount,
    ReconciliationFlag,
    RegistryRecord,
    WebhookEvent,
)
from vaada.models.enums import (
    DisputeResolution,
    DisputeStatus,
    MilestoneStatus,
    PaymentStatus,
    PayoutStatus,
    RegistryStatus,
)
from vaada.money import disputes, refunds, webhooks
from vaada.money.errors import NotFoundError
from vaada.views import iso

router = APIRouter(prefix="/admin")


class ResolveBody(BaseModel):
    resolution: DisputeResolution
    refund_paise: int | None = Field(default=None, ge=0)
    note: str = Field(default="", max_length=2000)


class FlagBody(BaseModel):
    note: str = Field(min_length=1, max_length=1000)


@router.get("/queue")
async def queue(ctx: Ctx, admin: AdminUser) -> dict[str, Any]:
    limit_days = ctx.settings.refund_limit_days
    async with ctx.sessions() as session:
        open_disputes = (
            await session.execute(
                select(Dispute, Milestone, Deal, Payment)
                .join(Milestone, Milestone.id == Dispute.milestone_id)
                .join(Deal, Deal.id == Dispute.deal_id)
                .outerjoin(Payment, (Payment.deal_id == Deal.id) & (Payment.status == PaymentStatus.CAPTURED))
                .where(Dispute.status == DisputeStatus.OPEN)
            )
        ).all()
        flags = (
            await session.execute(
                select(ReconciliationFlag, Deal)
                .join(Deal, Deal.id == ReconciliationFlag.deal_id)
                .where(ReconciliationFlag.resolved_at.is_(None))
                .order_by(ReconciliationFlag.first_seen_at)
            )
        ).all()
        stuck = (
            await session.execute(
                select(Milestone, Deal)
                .join(Deal, Deal.id == Milestone.deal_id)
                .where(Milestone.status == MilestoneStatus.REFUND_REQUESTED)
            )
        ).all()
        registry = (
            await session.execute(
                select(RegistryRecord, Deal)
                .join(Deal, Deal.id == RegistryRecord.deal_id)
                .where(RegistryRecord.status == RegistryStatus.FAILED)
                .order_by(RegistryRecord.created_at)
            )
        ).all()
        accounts = (
            (
                await session.execute(
                    select(PayoutAccount).where(
                        PayoutAccount.status.in_(
                            (
                                PayoutStatus.NEEDS_CLARIFICATION,
                                PayoutStatus.SUSPENDED,
                                PayoutStatus.REJECTED,
                                PayoutStatus.UNDER_REVIEW,
                            )
                        )
                    )
                )
            )
            .scalars()
            .all()
        )
        failing_webhooks = (
            (
                await session.execute(
                    select(WebhookEvent)
                    .where(WebhookEvent.processed_at.is_(None), WebhookEvent.attempts > 0)
                    .order_by(WebhookEvent.received_at)
                )
            )
            .scalars()
            .all()
        )
        payments = (
            await session.execute(
                select(Payment, Deal)
                .join(Deal, Deal.id == Payment.deal_id)
                .where(Payment.status == PaymentStatus.CAPTURED)
            )
        ).all()

    dispute_rows = []
    for dispute, milestone, deal, payment in open_disputes:
        deadline = payment.captured_at + timedelta(days=limit_days) if payment and payment.captured_at else None
        dispute_rows.append(
            {
                "id": str(dispute.id),
                "deal_id": str(deal.id),
                "deed_no": deed_number(deal.deed_no),
                "milestone_idx": milestone.idx,
                "amount_paise": milestone.amount_paise,
                "transfer_paise": milestone.transfer_paise,
                "reason": dispute.reason,
                "opened_role": dispute.opened_role.value,
                "opened_at": iso(dispute.created_at),
                "hold_confirmed": dispute.hold_confirmed_at is not None,
                "refund_deadline": iso(deadline),
            }
        )
    dispute_rows.sort(key=lambda d: str(d["refund_deadline"] or "9999"))
    return {
        "disputes": dispute_rows,
        "flags": [
            {
                "id": str(f.id),
                "deal_id": str(d.id),
                "deed_no": deed_number(d.deed_no),
                "milestone_id": str(f.milestone_id) if f.milestone_id else None,
                "kind": f.kind.value,
                "summary": f.summary,
                "first_seen_at": iso(f.first_seen_at),
                "last_seen_at": iso(f.last_seen_at),
            }
            for f, d in flags
        ],
        "stuck_refunds": [
            {
                "milestone_id": str(m.id),
                "deal_id": str(d.id),
                "deed_no": deed_number(d.deed_no),
                "milestone_idx": m.idx,
                "amount_paise": (m.refund_intent or {}).get("refund_paise", m.amount_paise),
                "purpose": (m.refund_intent or {}).get("purpose"),
            }
            for m, d in stuck
        ],
        "registry_failures": [
            {
                "id": str(r.id),
                "deal_id": str(d.id),
                "deed_no": deed_number(d.deed_no),
                "kind": r.kind.value,
                "attempts": r.attempts,
                "error": r.last_error,
            }
            for r, d in registry
        ],
        "payout_accounts": [
            {
                "user_id": str(a.user_id),
                "status": a.status.value,
                "legal_name": a.legal_name,
                "requirements": a.requirements,
                "updated_at": iso(a.updated_at),
            }
            for a in accounts
        ],
        "webhook_failures": [
            {
                "event_id": w.event_id,
                "type": w.event_type,
                "attempts": w.attempts,
                "error": w.error,
                "received_at": iso(w.received_at),
            }
            for w in failing_webhooks
        ],
        "refund_deadlines": sorted(
            (
                {
                    "deal_id": str(d.id),
                    "deed_no": deed_number(d.deed_no),
                    "status": d.status.value,
                    "captured_at": iso(p.captured_at),
                    "refund_deadline": iso(p.captured_at + timedelta(days=limit_days)) if p.captured_at else None,
                }
                for p, d in payments
                if d.status.value not in ("completed",)
            ),
            key=lambda r: r["refund_deadline"] or "9999",
        ),
        "admin": admin.email,
    }


@router.post("/disputes/{dispute_id}/preview")
async def preview(dispute_id: uuid.UUID, body: ResolveBody, ctx: Ctx, _: AdminUser) -> dict[str, Any]:
    planned = await disputes.preview(ctx, dispute_id, body.resolution, body.refund_paise)
    return planned.__dict__ | {"resolution": planned.resolution.value}


@router.post("/disputes/{dispute_id}/resolve")
async def resolve(dispute_id: uuid.UUID, body: ResolveBody, ctx: Ctx, admin: AdminUser) -> dict[str, Any]:
    planned = await disputes.resolve(ctx, dispute_id, admin, body.resolution, body.refund_paise, body.note)
    return planned.__dict__ | {"resolution": planned.resolution.value}


@router.post("/milestones/{milestone_id}/retry-refund")
async def retry_refund(milestone_id: uuid.UUID, ctx: Ctx, _: AdminUser) -> dict[str, Any]:
    outcome = await refunds.retry_refund(ctx, milestone_id)
    return {"completed": outcome.completed, "message": outcome.message}


@router.post("/milestones/{milestone_id}/retry-release")
async def retry_release(milestone_id: uuid.UUID, ctx: Ctx, _: AdminUser) -> dict[str, str]:
    return {"message": await refunds.retry_release(ctx, milestone_id)}


@router.post("/flags/{flag_id}/resolve", status_code=204)
async def resolve_flag(flag_id: uuid.UUID, body: FlagBody, ctx: Ctx, admin: AdminUser) -> Response:
    async with transaction(ctx.sessions) as session:
        flag = await session.get(ReconciliationFlag, flag_id, with_for_update=True)
        if flag is None:
            raise NotFoundError("That flag")
        flag.resolved_at = ctx.clock.now()
        flag.resolved_by = admin.id
        flag.resolution_note = body.note
    return Response(status_code=204)


@router.post("/webhooks/{event_id}/replay")
async def replay(event_id: str, ctx: Ctx, _: AdminUser) -> dict[str, bool]:
    return {"processed": await webhooks.replay(ctx, event_id)}


@router.post("/registry/{record_id}/retry", status_code=204)
async def retry_registry(record_id: uuid.UUID, ctx: Ctx, _: AdminUser) -> Response:
    async with transaction(ctx.sessions) as session:
        record = await session.get(RegistryRecord, record_id, with_for_update=True)
        if record is None:
            raise NotFoundError("That record")
        record.status = RegistryStatus.QUEUED
        record.next_attempt_at = ctx.clock.now()
    await ctx.kick("post_registry")
    return Response(status_code=204)


@router.get("/corrected-dictations", response_class=Response)
async def corrected_dictations(ctx: Ctx, _: AdminUser) -> Response:
    """Paste these lines into web/src/normalize/cases/corrected.ts to keep each fix fixed."""
    import json

    async with ctx.sessions() as session:
        rows = (
            (
                await session.execute(
                    select(Dictation).where(Dictation.corrected.is_(True)).order_by(Dictation.created_at)
                )
            )
            .scalars()
            .all()
        )
    lines = [
        "  [" + ", ".join(json.dumps(v, ensure_ascii=False) for v in (d.kind, d.raw_text, d.corrected_value)) + "],"
        for d in rows
        if d.kind in ("amount", "date", "count", "name")
    ]
    return Response(content="\n".join(lines) + "\n", media_type="text/plain; charset=utf-8")
