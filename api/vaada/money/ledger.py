import uuid
from datetime import datetime

from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from vaada.models import LedgerEntry
from vaada.models.enums import LedgerKind


async def record(
    session: AsyncSession,
    *,
    deal_id: uuid.UUID,
    kind: LedgerKind,
    amount_paise: int,
    razorpay_object_id: str,
    key: str,
    at: datetime,
    milestone_id: uuid.UUID | None = None,
    webhook_event_id: str | None = None,
    note: str = "",
) -> bool:
    """Appends one money event. Returns False when the key was already recorded, which is how a
    replayed webhook or a second click becomes a no-op."""
    if amount_paise <= 0:
        raise ValueError("ledger amounts are positive; the kind carries direction")
    stmt = (
        insert(LedgerEntry)
        .values(
            deal_id=deal_id,
            milestone_id=milestone_id,
            kind=kind,
            amount_paise=amount_paise,
            razorpay_object_id=razorpay_object_id,
            webhook_event_id=webhook_event_id,
            idempotency_key=key,
            note=note,
            created_at=at,
        )
        .on_conflict_do_nothing(index_elements=[LedgerEntry.idempotency_key])
        .returning(LedgerEntry.id)
    )
    return (await session.execute(stmt)).scalar_one_or_none() is not None
