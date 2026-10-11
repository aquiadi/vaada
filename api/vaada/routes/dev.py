"""Dev and demo only: personas, the email outbox, time travel and the fake Checkout. The router is not
even mounted unless the boot guards have allowed the dev tools."""

from datetime import UTC, datetime, timedelta
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select

from vaada.agreement import ist_date
from vaada.auth import mint_persona_token
from vaada.clock import TravellingClock
from vaada.deps import Ctx
from vaada.models import OutboundEmail, User
from vaada.money.fake_gateway import FakeGateway
from vaada.money.gateway import GatewayRejectedError
from vaada.ratelimit import rate_limit
from vaada.seed import PERSONAS

# The demo is public, so even its pretend tools are rate limited.
router = APIRouter(prefix="/dev", dependencies=[Depends(rate_limit("dev", times=60, seconds=60))])


class AdvanceBody(BaseModel):
    days: int = Field(default=0, ge=0, le=200)
    hours: int = Field(default=0, ge=0, le=1000)


class FakePayBody(BaseModel):
    method: Literal["upi", "netbanking", "card"] = "upi"
    succeed: bool = True


@router.get("/personas")
async def personas(ctx: Ctx) -> dict[str, Any]:
    if not ctx.settings.persona_switcher_enabled:
        raise HTTPException(status_code=404)
    return {"personas": [{"key": p.key, "name": p.name, "email": p.email, "about": p.about} for p in PERSONAS]}


@router.post("/personas/{key}/token")
async def persona_token(key: str, ctx: Ctx) -> dict[str, str]:
    if not ctx.settings.persona_switcher_enabled:
        raise HTTPException(status_code=404)
    persona = next((p for p in PERSONAS if p.key == key), None)
    if persona is None:
        raise HTTPException(status_code=404, detail="No such persona.")
    async with ctx.sessions() as session:
        user = (await session.execute(select(User).where(User.email == persona.email))).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=409, detail="Personas aren't seeded yet. Run make seed.")
    token = mint_persona_token(
        ctx.settings.persona_token_secret,
        user_id=user.id,
        email=persona.email,
        name=persona.name,
        now=datetime.now(UTC),
    )
    return {"access_token": token, "name": persona.name, "email": persona.email}


@router.get("/outbox")
async def outbox(ctx: Ctx) -> dict[str, Any]:
    async with ctx.sessions() as session:
        rows = (
            (await session.execute(select(OutboundEmail).order_by(OutboundEmail.created_at.desc()).limit(100)))
            .scalars()
            .all()
        )
    return {
        "emails": [
            {
                "id": str(e.id),
                "to": e.to_email,
                "subject": e.subject,
                "template": e.template,
                "status": e.status.value,
                "created_at": e.created_at.isoformat(),
                "html": e.html,
                "text": e.text_body,
            }
            for e in rows
        ]
    }


def _clock_view(ctx: Ctx) -> dict[str, Any]:
    now = ctx.clock.now()
    offset = ctx.clock.offset if isinstance(ctx.clock, TravellingClock) else timedelta(0)
    return {"now": now.isoformat(), "today": ist_date(now).isoformat(), "offset_seconds": int(offset.total_seconds())}


@router.get("/clock")
async def clock(ctx: Ctx) -> dict[str, Any]:
    return _clock_view(ctx)


@router.post("/clock/advance")
async def advance(body: AdvanceBody, ctx: Ctx) -> dict[str, Any]:
    if not isinstance(ctx.clock, TravellingClock):
        raise HTTPException(status_code=404)
    await ctx.clock.advance(timedelta(days=body.days, hours=body.hours))
    await ctx.kick("tick")
    return _clock_view(ctx)


@router.post("/fake-checkout/{order_id}")
async def fake_checkout(order_id: str, body: FakePayBody, ctx: Ctx) -> dict[str, str]:
    gateway = ctx.gateway
    if not isinstance(gateway, FakeGateway):
        raise HTTPException(status_code=404)
    try:
        response = await gateway.simulate_checkout(order_id, method=body.method, succeed=body.succeed)
    except GatewayRejectedError as exc:
        raise HTTPException(status_code=402, detail=str(exc)) from exc
    await ctx.kick("tick")
    return response


@router.post("/tick")
async def tick(ctx: Ctx) -> dict[str, Any]:
    """Runs the worker's periodic jobs once, now. The e2e test uses it instead of waiting on the schedule."""
    from vaada.jobs.tasks import run_tick

    return await run_tick(ctx)
