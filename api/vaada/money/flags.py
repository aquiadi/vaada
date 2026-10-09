import uuid
from datetime import datetime
from typing import Any

import sentry_sdk
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from vaada.models import ReconciliationFlag
from vaada.models.enums import FlagKind


async def raise_flag(
    session: AsyncSession,
    *,
    deal_id: uuid.UUID,
    kind: FlagKind,
    summary: str,
    at: datetime,
    milestone_id: uuid.UUID | None = None,
    detail: dict[str, Any] | None = None,
) -> bool:
    """Puts something in front of a human in the admin queue. Returns True for a new flag; a flag that is
    already open is only touched, so a recurring check doesn't spam Sentry."""
    existing = (
        await session.execute(
            select(ReconciliationFlag).where(
                ReconciliationFlag.deal_id == deal_id,
                ReconciliationFlag.milestone_id.is_(None)
                if milestone_id is None
                else ReconciliationFlag.milestone_id == milestone_id,
                ReconciliationFlag.kind == kind,
                ReconciliationFlag.resolved_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        existing.last_seen_at = at
        existing.summary = summary
        existing.detail = detail or existing.detail
        return False
    session.add(
        ReconciliationFlag(
            deal_id=deal_id,
            milestone_id=milestone_id,
            kind=kind,
            summary=summary,
            detail=detail or {},
            first_seen_at=at,
            last_seen_at=at,
        )
    )
    sentry_sdk.capture_message(f"vaada {kind}: {summary}", level="error")
    return True
