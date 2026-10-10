import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from vaada.config import Settings
from vaada.email.messages import DealFacts, MilestoneFacts
from vaada.models import Deal, Milestone, Payment, PayoutAccount, User
from vaada.models.enums import DealStatus, MilestoneStatus, PaymentStatus, Role
from vaada.money.errors import ForbiddenError, MoneyError, NotFoundError

SETTLED_STATES = frozenset(
    {MilestoneStatus.RELEASED, MilestoneStatus.REFUNDED, MilestoneStatus.RESOLVED, MilestoneStatus.CANCELLED}
)
MONEY_MOVED_STATES = frozenset(
    {MilestoneStatus.DELIVERED, MilestoneStatus.RELEASED, MilestoneStatus.REFUNDED, MilestoneStatus.RESOLVED}
)


async def load_deal(session: AsyncSession, deal_id: uuid.UUID, *, lock: bool = False) -> Deal:
    stmt = select(Deal).where(Deal.id == deal_id)
    if lock:
        stmt = stmt.with_for_update()
    deal = (await session.execute(stmt)).scalar_one_or_none()
    if deal is None:
        raise NotFoundError("That deed")
    return deal


async def load_milestone(session: AsyncSession, milestone_id: uuid.UUID, *, lock: bool = False) -> Milestone:
    stmt = select(Milestone).where(Milestone.id == milestone_id)
    if lock:
        stmt = stmt.with_for_update()
    milestone = (await session.execute(stmt)).scalar_one_or_none()
    if milestone is None:
        raise NotFoundError("That milestone")
    return milestone


def role_of(deal: Deal, user_id: uuid.UUID) -> Role | None:
    if deal.freelancer_id == user_id:
        return Role.MAKER
    if deal.client_id == user_id:
        return Role.CLIENT
    return None


def require_role(deal: Deal, user_id: uuid.UUID, *roles: Role) -> Role:
    role = role_of(deal, user_id)
    if role is None:
        raise NotFoundError("That deed")
    if role not in roles:
        who = " or ".join("the Maker" if r == Role.MAKER else "the Client" for r in roles)
        raise ForbiddenError(f"Only {who} can do that.")
    return role


async def captured_payment(session: AsyncSession, deal_id: uuid.UUID) -> Payment | None:
    return (
        await session.execute(
            select(Payment).where(Payment.deal_id == deal_id, Payment.status == PaymentStatus.CAPTURED)
        )
    ).scalar_one_or_none()


async def require_captured_payment(session: AsyncSession, deal_id: uuid.UUID) -> Payment:
    payment = await captured_payment(session, deal_id)
    if payment is None or not payment.razorpay_payment_id:
        raise MoneyError("This deed hasn't been paid yet.")
    return payment


async def payout_account_of(session: AsyncSession, user_id: uuid.UUID) -> PayoutAccount | None:
    return (await session.execute(select(PayoutAccount).where(PayoutAccount.user_id == user_id))).scalar_one_or_none()


def derive_status(deal: Deal) -> DealStatus:
    """The deal's status follows its milestones once money is in play."""
    if deal.status in (DealStatus.DRAFT, DealStatus.PUBLISHED, DealStatus.LAPSED, DealStatus.CANCELLED):
        return deal.status
    states = [m.status for m in deal.milestones]
    if deal.status == DealStatus.ACCEPTED and all(s == MilestoneStatus.UNFUNDED for s in states):
        return DealStatus.ACCEPTED
    if any(s == MilestoneStatus.DISPUTED for s in states):
        return DealStatus.DISPUTED
    if states and all(s in SETTLED_STATES for s in states):
        return DealStatus.COMPLETED
    if any(s in MONEY_MOVED_STATES or s == MilestoneStatus.REFUND_REQUESTED for s in states):
        return DealStatus.ACTIVE
    if states and all(s == MilestoneStatus.HELD for s in states):
        return DealStatus.FUNDED
    return deal.status


def apply_status(deal: Deal, now: datetime) -> None:
    new = derive_status(deal)
    if new == deal.status:
        return
    if new == DealStatus.COMPLETED:
        deal.completed_at = now
    deal.status = new


async def deal_facts(session: AsyncSession, settings: Settings, deal: Deal) -> DealFacts:
    terms = deal.terms or {}
    maker = await session.get(User, deal.freelancer_id)
    maker_name = terms.get("maker_name") or (maker.display_name if maker else None) or "The Maker"
    return DealFacts(
        deed_no=deal.deed_no,
        title=deal.title or "this work",
        maker=maker_name,
        client=terms.get("client_name") or "the Client",
        room_url=f"{settings.web_url}/d/{deal.id}",
        deed_url=f"{settings.web_url}/a/{deal.slug}",
    )


def refuse_if_paused(settings: Settings) -> None:
    """NEW_DEALS_PAUSED stops new deeds going out and new money coming in; money already held carries on."""
    if settings.new_deals_paused:
        raise MoneyError(
            "Vaada isn't taking new deeds or payments just now. Deeds already paid carry on as agreed. "
            "Please try again later.",
            status_code=503,
            code="paused",
        )


def milestone_facts(m: Milestone) -> MilestoneFacts:
    return MilestoneFacts(idx=m.idx, title=m.title, amount_paise=m.amount_paise, transfer_paise=m.transfer_paise)


async def party_emails(session: AsyncSession, deal: Deal) -> tuple[str | None, str | None]:
    maker = await session.get(User, deal.freelancer_id)
    client = await session.get(User, deal.client_id) if deal.client_id else None
    return (maker.email if maker else None), (client.email if client else deal.client_email)


async def maker_id_of(session: AsyncSession, deal: Deal) -> str | None:
    maker = await session.get(User, deal.freelancer_id)
    return maker.maker_id if maker else None
