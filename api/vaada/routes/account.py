"""Config for the web app, the signed-in person, payouts and the ledger."""

import json
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Query, Response
from pydantic import BaseModel, Field
from sqlalchemy import select

from vaada import ledger_view, users
from vaada.agreement import ist_date
from vaada.deps import Ctx, CurrentUser
from vaada.models import PayoutAccount
from vaada.money import payouts
from vaada.ratelimit import rate_limit

router = APIRouter()
AuthLimit = Annotated[None, Depends(rate_limit("auth", times=30, seconds=60))]
ConfigLimit = Annotated[None, Depends(rate_limit("config", times=120, seconds=60))]


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/config")
async def config(ctx: Ctx, _: ConfigLimit) -> dict[str, Any]:
    s = ctx.settings
    now = ctx.clock.now()
    return {
        "env": s.vaada_env.value,
        "demo": s.vaada_env.value == "demo",
        "supabase_url": s.supabase_url,
        "supabase_anon_key": s.supabase_anon_key,
        "google_signin_enabled": s.google_signin_enabled,
        "persona_switcher": s.persona_switcher_enabled,
        "dev_tools": s.dev_tools_enabled,
        "new_deals_paused": s.new_deals_paused,
        "contact": {
            "address": s.contact_address,
            "phone": s.contact_phone,
            "email": s.support_email,
            "legal_entity": s.legal_entity,
            "grievance_officer": s.grievance_officer,
            "jurisdiction_city": s.jurisdiction_city,
        },
        "gateway": ctx.gateway.kind,
        "chain_id": s.chain_id,
        "registry_address": s.registry_address or None,
        "explorer_tx_url": s.chain_explorer_tx_url or None,
        "fees": {"client_fee_bps": s.client_fee_bps, "platform_fee_bps": s.platform_fee_bps},
        "limits": {
            "max_deal_days": s.max_deal_days,
            "review_window_days": s.review_window_days,
            "hold_buffer_hours": s.hold_buffer_hours,
            "grace_days": s.grace_days,
            "accept_pay_days": s.accept_pay_days,
            "upi_limit_paise": s.upi_limit_paise,
            "min_deal_paise": s.min_deal_paise,
        },
        "now": now.isoformat(),
        "today": ist_date(now).isoformat(),
    }


def payout_view(account: PayoutAccount | None) -> dict[str, Any] | None:
    if account is None:
        return None
    return {
        "status": account.status.value,
        "legal_name": account.legal_name,
        "business_type": account.business_type,
        "bank_last4": account.bank_last4,
        "ifsc": account.ifsc,
        "requirements": account.requirements,
        "activated_at": account.activated_at.isoformat() if account.activated_at else None,
    }


class ProfileBody(BaseModel):
    display_name: str | None = Field(default=None, max_length=80)
    handle: str | None = Field(default=None, max_length=40)


@router.get("/me")
async def me(ctx: Ctx, user: CurrentUser, _: AuthLimit) -> dict[str, Any]:
    async with ctx.sessions() as session:
        account = (
            await session.execute(select(PayoutAccount).where(PayoutAccount.user_id == user.id))
        ).scalar_one_or_none()
    return {
        "id": str(user.id),
        "email": user.email,
        "display_name": user.display_name,
        "handle": user.handle,
        "maker_id": user.maker_id,
        "is_admin": users.is_admin(ctx, user),
        "is_persona": user.is_persona,
        "payout": payout_view(account),
    }


@router.patch("/me")
async def update_me(body: ProfileBody, ctx: Ctx, user: CurrentUser) -> dict[str, Any]:
    stored = await users.update_profile(ctx, user, display_name=body.display_name, handle=body.handle)
    return {"display_name": stored.display_name, "handle": stored.handle}


@router.get("/me/export")
async def export(ctx: Ctx, user: CurrentUser) -> Response:
    data = await users.export_data(ctx, user)
    return Response(
        content=json.dumps(data, default=str, ensure_ascii=False, indent=2),
        media_type="application/json",
        headers={"Content-Disposition": 'attachment; filename="vaada-export.json"'},
    )


@router.delete("/me", status_code=204)
async def delete_me(ctx: Ctx, user: CurrentUser) -> Response:
    await users.delete_account(ctx, user)
    return Response(status_code=204)


@router.get("/payouts")
async def payout_status(ctx: Ctx, user: CurrentUser) -> dict[str, Any]:
    return {"payout": payout_view(await payouts.refresh(ctx, user))}


@router.post("/payouts")
async def payout_setup(body: payouts.PayoutForm, ctx: Ctx, user: CurrentUser) -> dict[str, Any]:
    return {"payout": payout_view(await payouts.setup(ctx, user, body))}


@router.get("/ledger")
async def ledger(
    ctx: Ctx,
    user: CurrentUser,
    view: Annotated[Literal["all", "open", "held", "released"], Query(alias="filter")] = "all",
) -> dict[str, Any]:
    rows = await ledger_view.entries(ctx, user, view)
    everything = rows if view == "all" else await ledger_view.entries(ctx, user, "all")
    last = everything[-1] if everything else None
    return {
        "entries": rows,
        "totals": ledger_view.totals(rows),
        "balances": {
            "held_paise": last["held_balance_paise"] if last else 0,
            "received_paise": last["received_total_paise"] if last else 0,
        },
    }


@router.get("/ledger.csv")
async def ledger_csv(ctx: Ctx, user: CurrentUser) -> Response:
    rows = await ledger_view.entries(ctx, user, "all")
    return Response(
        content=ledger_view.as_csv(rows),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="vaada-ledger.csv"'},
    )
