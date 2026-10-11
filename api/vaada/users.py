"""People: first sign-in, profile, export and deletion."""

import logging
import re
import secrets
import uuid
from typing import Any

import httpx
from sqlalchemy import func, inspect, or_, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from vaada.auth import Identity
from vaada.context import AppContext
from vaada.db import transaction
from vaada.models import (
    Acceptance,
    Cancellation,
    Deal,
    DealEvent,
    Dictation,
    Dispute,
    LedgerEntry,
    Milestone,
    OutboundEmail,
    Payment,
    PayoutAccount,
    User,
    VoiceUpdate,
)
from vaada.models.enums import DealStatus, EmailStatus, MilestoneStatus
from vaada.money.errors import ForbiddenError, MoneyError

log = logging.getLogger(__name__)

OPEN_MONEY = frozenset(
    {
        MilestoneStatus.HELD,
        MilestoneStatus.DELIVERED,
        MilestoneStatus.DISPUTED,
        MilestoneStatus.REFUND_REQUESTED,
    }
)


def new_maker_id() -> str:
    """Random, not derived from anything about the person, so the chain can't be tied back to them."""
    return "0x" + secrets.token_hex(32)


async def ensure_user(ctx: AppContext, identity: Identity) -> User:
    async with transaction(ctx.sessions) as session:
        await session.execute(
            insert(User)
            .values(
                id=identity.user_id,
                email=identity.email.lower() if identity.email else None,
                phone=identity.phone,
                display_name=identity.full_name,
                maker_id=new_maker_id(),
                is_persona=identity.via_persona,
            )
            .on_conflict_do_nothing(index_elements=[User.id])
        )
        user = await session.get(User, identity.user_id)
        assert user is not None
        if user.deleted_at is not None:
            raise ForbiddenError("This account was deleted.")
        if identity.email and user.email != identity.email.lower():
            user.email = identity.email.lower()
        if identity.phone and user.phone != identity.phone:
            user.phone = identity.phone
        return user


def handle_from(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:28] or "maker"


async def update_profile(ctx: AppContext, user: User, *, display_name: str | None, handle: str | None) -> User:
    async with transaction(ctx.sessions) as session:
        stored = await session.get(User, user.id, with_for_update=True)
        assert stored is not None
        if display_name is not None:
            name = " ".join(display_name.split())
            if not 2 <= len(name) <= 80:
                raise MoneyError("A name between 2 and 80 characters, please.", status_code=422)
            stored.display_name = name
            if stored.handle is None and handle is None:
                handle = handle_from(name)
        if handle is not None:
            wanted = handle_from(handle)
            candidate = wanted
            for _ in range(20):
                taken = await session.scalar(
                    select(func.count())
                    .select_from(User)
                    .where(func.lower(User.handle) == candidate, User.id != stored.id)
                )
                if not taken:
                    break
                candidate = f"{wanted}-{secrets.randbelow(900) + 100}"
            stored.handle = candidate
        return stored


async def export_data(ctx: AppContext, user: User) -> dict[str, Any]:
    """Everything about this person, and the deeds as both parties already see them. Not the other party's
    personal details: their acceptance evidence, a Maker's private draft and the Maker's books stay out."""
    async with ctx.sessions() as session:
        deals = (
            (await session.execute(select(Deal).where(or_(Deal.freelancer_id == user.id, Deal.client_id == user.id))))
            .scalars()
            .all()
        )
        deal_ids = [d.id for d in deals]
        made = [d.id for d in deals if d.freelancer_id == user.id]
        paid_for = [d.id for d in deals if d.client_id == user.id]
        payout = (
            await session.execute(select(PayoutAccount).where(PayoutAccount.user_id == user.id))
        ).scalar_one_or_none()

        async def rows(model: Any, *where: Any) -> list[dict[str, Any]]:
            found = (await session.execute(select(model).where(*where))).scalars().all()
            columns = inspect(model).column_attrs
            return [{c.key: getattr(r, c.key) for c in columns} for r in found]

        def deed(d: Deal) -> dict[str, Any]:
            mine = d.freelancer_id == user.id
            return {
                "id": d.id,
                "deed_no": d.deed_no,
                "role": "maker" if mine else "client",
                "status": d.status,
                "title": d.title,
                "agreement": d.terms,
                "agreement_hash": d.agreement_hash,
                "struck_clauses": d.struck_clauses,
                "published_at": d.published_at,
                "accepted_at": d.accepted_at,
                "funded_at": d.funded_at,
                "completed_at": d.completed_at,
                "cancelled_at": d.cancelled_at,
                "lapsed_at": d.lapsed_at,
                **({"draft": d.draft} if mine else {}),
            }

        return {
            "profile": {
                "id": str(user.id),
                "email": user.email,
                "phone": user.phone,
                "display_name": user.display_name,
                "handle": user.handle,
                "maker_id": user.maker_id,
                "created_at": user.created_at,
            },
            "payout_account": (
                {
                    "status": payout.status,
                    "legal_name": payout.legal_name,
                    "business_type": payout.business_type,
                    "bank_last4": payout.bank_last4,
                    "ifsc": payout.ifsc,
                    "razorpay_account_id": payout.razorpay_account_id,
                }
                if payout
                else None
            ),
            "deeds": [deed(d) for d in deals],
            "milestones": await rows(Milestone, Milestone.deal_id.in_(deal_ids)),
            "acceptances": await rows(Acceptance, Acceptance.user_id == user.id),
            "payments": await rows(Payment, Payment.deal_id.in_(paid_for)),
            "ledger": await rows(LedgerEntry, LedgerEntry.deal_id.in_(made)),
            "register": await rows(DealEvent, DealEvent.deal_id.in_(deal_ids)),
            "dictations": await rows(Dictation, Dictation.user_id == user.id),
            "voice_updates": await rows(VoiceUpdate, VoiceUpdate.user_id == user.id),
            "disputes": await rows(Dispute, Dispute.deal_id.in_(deal_ids)),
            "cancellations": await rows(Cancellation, Cancellation.deal_id.in_(deal_ids)),
        }


async def _open_money(session: AsyncSession, user_id: uuid.UUID) -> int:
    return int(
        await session.scalar(
            select(func.count())
            .select_from(Milestone)
            .join(Deal, Deal.id == Milestone.deal_id)
            .where(or_(Deal.freelancer_id == user_id, Deal.client_id == user_id), Milestone.status.in_(OPEN_MONEY))
        )
        or 0
    )


MONEY_STILL_HELD = (
    "Money is still held on one of your deeds. Once it's released or refunded, you can delete your account."
)


async def _delete_sign_in(ctx: AppContext, user: User) -> None:
    """Removes the person's Supabase Auth record, which holds their email. Without a service key (dev) or for a
    persona there is none to remove."""
    key = ctx.settings.supabase_service_role_key
    if not key or user.is_persona:
        return
    url = f"{ctx.settings.supabase_url.rstrip('/')}/auth/v1/admin/users/{user.id}"
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.delete(url, headers={"apikey": key, "Authorization": f"Bearer {key}"})
    except httpx.HTTPError as exc:
        raise MoneyError(
            "We couldn't reach our sign-in service, so nothing was deleted. Try again.", status_code=502
        ) from exc
    if response.status_code not in (200, 204, 404):
        log.error("deleting auth user %s failed: %s", user.id, response.status_code)
        raise MoneyError(
            "Our sign-in service refused the deletion, so nothing was deleted. Try again later.", status_code=502
        )


async def delete_account(ctx: AppContext, user: User) -> None:
    """Anonymises the person and unlinks their maker_id. Money records the law makes us keep stay,
    attached to an account that no longer says who it was. Drafts, dictations, the letters we sent them and
    their sign-in record go."""
    async with ctx.sessions() as session:
        if await _open_money(session, user.id):
            raise MoneyError(MONEY_STILL_HELD)
    await _delete_sign_in(ctx, user)
    async with transaction(ctx.sessions) as session:
        stored = await session.get(User, user.id, with_for_update=True)
        assert stored is not None
        if await _open_money(session, user.id):
            raise MoneyError(MONEY_STILL_HELD)
        drafts = (
            (await session.execute(select(Deal).where(Deal.freelancer_id == user.id, Deal.status == DealStatus.DRAFT)))
            .scalars()
            .all()
        )
        for draft in drafts:
            await session.delete(draft)
        for dictation in (await session.execute(select(Dictation).where(Dictation.user_id == user.id))).scalars():
            await session.delete(dictation)
        if stored.email:
            addressed = func.lower(OutboundEmail.to_email) == stored.email.lower()
            await session.execute(
                update(OutboundEmail)
                .where(addressed, OutboundEmail.status == EmailStatus.QUEUED)
                .values(status=EmailStatus.FAILED, last_error="The account was deleted before this was sent.")
            )
            await session.execute(
                update(OutboundEmail)
                .where(addressed)
                .values(to_email="removed", subject="Removed when the account was deleted", html=None, text_body=None)
            )
        stored.email = None
        stored.phone = None
        stored.display_name = None
        stored.handle = None
        stored.maker_id = None
        stored.deleted_at = ctx.clock.now()
        payout = (
            await session.execute(select(PayoutAccount).where(PayoutAccount.user_id == user.id))
        ).scalar_one_or_none()
        if payout is not None:
            payout.legal_name = None


def is_admin(ctx: AppContext, user: User) -> bool:
    return bool(user.email) and user.email.lower() in ctx.settings.admin_email_set  # type: ignore[union-attr]
