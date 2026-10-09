"""People: first sign-in, profile, export and deletion."""

import re
import secrets
from typing import Any

from sqlalchemy import func, inspect, or_, select
from sqlalchemy.dialects.postgresql import insert

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
    PayoutAccount,
    User,
    VoiceUpdate,
)
from vaada.models.enums import DealStatus, MilestoneStatus
from vaada.money.errors import ForbiddenError, MoneyError

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
    async with ctx.sessions() as session:
        deals = (
            (await session.execute(select(Deal).where(or_(Deal.freelancer_id == user.id, Deal.client_id == user.id))))
            .scalars()
            .all()
        )
        deal_ids = [d.id for d in deals]
        payout = (
            await session.execute(select(PayoutAccount).where(PayoutAccount.user_id == user.id))
        ).scalar_one_or_none()

        async def rows(model: Any, *where: Any) -> list[dict[str, Any]]:
            found = (await session.execute(select(model).where(*where))).scalars().all()
            columns = inspect(model).column_attrs
            return [{c.key: getattr(r, c.key) for c in columns} for r in found]

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
            "deeds": await rows(Deal, Deal.id.in_(deal_ids)),
            "milestones": await rows(Milestone, Milestone.deal_id.in_(deal_ids)),
            "acceptances": await rows(Acceptance, Acceptance.deal_id.in_(deal_ids)),
            "ledger": await rows(LedgerEntry, LedgerEntry.deal_id.in_(deal_ids)),
            "register": await rows(DealEvent, DealEvent.deal_id.in_(deal_ids)),
            "dictations": await rows(Dictation, Dictation.user_id == user.id),
            "voice_updates": await rows(VoiceUpdate, VoiceUpdate.user_id == user.id),
            "disputes": await rows(Dispute, Dispute.deal_id.in_(deal_ids)),
            "cancellations": await rows(Cancellation, Cancellation.deal_id.in_(deal_ids)),
        }


async def delete_account(ctx: AppContext, user: User) -> None:
    """Anonymises the person and unlinks their maker_id. Money records the law makes us keep stay,
    attached to an account that no longer says who it was. Drafts and dictations go."""
    async with transaction(ctx.sessions) as session:
        stored = await session.get(User, user.id, with_for_update=True)
        assert stored is not None
        open_money = await session.scalar(
            select(func.count())
            .select_from(Milestone)
            .join(Deal, Deal.id == Milestone.deal_id)
            .where(
                or_(Deal.freelancer_id == user.id, Deal.client_id == user.id),
                Milestone.status.in_(OPEN_MONEY),
            )
        )
        if open_money:
            raise MoneyError(
                "Money is still held on one of your deeds. Once it's released or refunded, you can delete your account."
            )
        drafts = (
            (await session.execute(select(Deal).where(Deal.freelancer_id == user.id, Deal.status == DealStatus.DRAFT)))
            .scalars()
            .all()
        )
        for draft in drafts:
            await session.delete(draft)
        for dictation in (await session.execute(select(Dictation).where(Dictation.user_id == user.id))).scalars():
            await session.delete(dictation)
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
