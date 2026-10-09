"""The register: the human-readable timeline both parties see in the deal room."""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from vaada.models import DealEvent
from vaada.models.enums import Role


async def log(
    session: AsyncSession,
    *,
    deal_id: uuid.UUID,
    kind: str,
    summary: str,
    role: Role,
    at: datetime,
    actor_id: uuid.UUID | None = None,
    milestone_id: uuid.UUID | None = None,
    detail: dict[str, Any] | None = None,
) -> None:
    session.add(
        DealEvent(
            deal_id=deal_id,
            milestone_id=milestone_id,
            actor_id=actor_id,
            actor_role=role,
            kind=kind,
            summary=summary,
            detail=detail or {},
            created_at=at,
        )
    )
