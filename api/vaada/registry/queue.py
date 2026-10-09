from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from vaada.agreement import ZERO_REF, registry_ref
from vaada.config import Settings
from vaada.models import Deal, Milestone, RegistryRecord
from vaada.models.enums import RegistryKind


async def queue_record(
    session: AsyncSession,
    settings: Settings,
    *,
    deal: Deal,
    maker_id: str | None,
    kind: RegistryKind,
    razorpay_id: str | None = None,
    milestone: Milestone | None = None,
) -> None:
    """Queues a public record. The chain is a notary: nothing in the money path waits for this."""
    if not deal.agreement_hash or not maker_id:
        return
    ref = registry_ref(settings.ref_hmac_secret, razorpay_id) if razorpay_id else ZERO_REF
    stmt = (
        insert(RegistryRecord)
        .values(
            deal_id=deal.id,
            milestone_id=milestone.id if milestone else None,
            kind=kind,
            deal_hash=deal.agreement_hash,
            maker_id=maker_id,
            ref=ref,
        )
        .on_conflict_do_nothing(constraint="uq_registry_records_deal_kind_ref")
    )
    await session.execute(stmt)
