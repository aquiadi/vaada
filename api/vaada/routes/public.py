"""What anyone with the link can read, and the client's path from reading to paying."""

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from vaada import deals
from vaada.deps import Ctx, CurrentUser, OptionalUser, client_ip
from vaada.format import deed_number
from vaada.models import Deal, Milestone, RegistryRecord, User
from vaada.models.enums import DealStatus, MilestoneStatus, RegistryKind
from vaada.money import funding
from vaada.money.errors import NotFoundError
from vaada.ratelimit import rate_limit
from vaada.views import iso, public_deed, registry_view

router = APIRouter()
PublicLimit = Annotated[None, Depends(rate_limit("public", times=120, seconds=60))]
WriteLimit = Annotated[None, Depends(rate_limit("public-write", times=20, seconds=60))]


class AcceptBody(BaseModel):
    full_name: str = Field(min_length=1, max_length=120)
    agree: bool


class CheckoutReturnBody(BaseModel):
    razorpay_order_id: str = Field(max_length=64)
    razorpay_payment_id: str = Field(max_length=64)
    razorpay_signature: str = Field(max_length=128)


async def _deal_by_slug(ctx: Ctx, slug: str) -> Deal:
    async with ctx.sessions() as session:
        deal = (await session.execute(select(Deal).where(Deal.slug == slug))).scalar_one_or_none()
        if deal is None or deal.status == DealStatus.DRAFT:
            raise NotFoundError("That deed")
        await session.refresh(deal, ["milestones"])
        return deal


@router.get("/public/deeds/{slug}")
async def read_deed(slug: str, ctx: Ctx, viewer: OptionalUser, _: PublicLimit) -> dict[str, Any]:
    return await public_deed(ctx, await _deal_by_slug(ctx, slug), viewer)


@router.post("/public/deeds/{slug}/accept")
async def accept(
    slug: str, body: AcceptBody, request: Request, ctx: Ctx, user: CurrentUser, _: WriteLimit
) -> dict[str, Any]:
    deal = await _deal_by_slug(ctx, slug)
    await deals.accept(
        ctx,
        deal.id,
        user,
        name_typed=body.full_name,
        agreed=body.agree,
        ip=client_ip(request, ctx.settings.trust_proxy_headers),
        user_agent=request.headers.get("user-agent"),
    )
    return await public_deed(ctx, await _deal_by_slug(ctx, slug), user)


@router.post("/public/deeds/{slug}/order")
async def open_order(slug: str, ctx: Ctx, user: CurrentUser, _: WriteLimit) -> dict[str, Any]:
    deal = await _deal_by_slug(ctx, slug)
    config = await funding.create_order(ctx, deal.id, user)
    return {
        "gateway": ctx.gateway.kind,
        "key_id": config.key_id,
        "order_id": config.order_id,
        "amount_paise": config.amount_paise,
        "upi_allowed": config.upi_allowed,
        "options": config.options,
    }


@router.post("/public/deeds/{slug}/checkout-return", status_code=202)
async def checkout_return(
    slug: str, body: CheckoutReturnBody, ctx: Ctx, user: CurrentUser, _: WriteLimit
) -> dict[str, str]:
    deal = await _deal_by_slug(ctx, slug)
    await funding.record_checkout_return(
        ctx,
        deal.id,
        user,
        order_id=body.razorpay_order_id,
        payment_id=body.razorpay_payment_id,
        signature=body.razorpay_signature,
    )
    return {"message": "We have your payment. Razorpay is confirming it now; this page updates by itself."}


@router.get("/public/makers/{handle}")
async def maker_certificate(handle: str, ctx: Ctx, _: PublicLimit) -> dict[str, Any]:
    """A public certificate: completed milestones and the total released, each linked to its registry record.
    No client names and no titles, only what the chain already shows plus the amounts."""
    async with ctx.sessions() as session:
        maker = (
            await session.execute(
                select(User).where(func.lower(User.handle) == handle.lower(), User.deleted_at.is_(None))
            )
        ).scalar_one_or_none()
        if maker is None:
            raise NotFoundError("That maker")
        rows = (
            await session.execute(
                select(Milestone, Deal)
                .join(Deal, Deal.id == Milestone.deal_id)
                .where(
                    Deal.freelancer_id == maker.id,
                    Milestone.status.in_((MilestoneStatus.RELEASED, MilestoneStatus.RESOLVED)),
                    Milestone.released_at.is_not(None),
                )
                .order_by(Milestone.released_at.desc())
            )
        ).all()
        records = (
            (
                await session.execute(
                    select(RegistryRecord).where(
                        RegistryRecord.milestone_id.in_([m.id for m, _ in rows]),
                        RegistryRecord.kind == RegistryKind.RELEASED,
                    )
                )
            )
            .scalars()
            .all()
        )
    by_milestone = {r.milestone_id: r for r in records}
    milestones = []
    for m, deal in rows:
        record = by_milestone.get(m.id)
        milestones.append(
            {
                "deed_no": deed_number(deal.deed_no),
                "idx": m.idx,
                "released_paise": m.transfer_paise - min(m.refund_paise, m.transfer_paise),
                "released_at": iso(m.released_at),
                "deal_hash": deal.agreement_hash,
                "registry": registry_view(ctx, record, m.idx) if record else None,
            }
        )
    return {
        "display_name": maker.display_name,
        "handle": maker.handle,
        "maker_id": maker.maker_id,
        "since": iso(maker.created_at),
        "milestones": milestones,
        "total_released_paise": sum(m["released_paise"] for m in milestones),
        "deeds": len({m["deed_no"] for m in milestones}),
        "registry_address": ctx.settings.registry_address or None,
        "chain_id": ctx.settings.chain_id,
    }
