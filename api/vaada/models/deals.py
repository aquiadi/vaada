import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    Sequence,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import INET, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from vaada.models.base import SCHEMA, Base, Timestamps, new_id, text_enum
from vaada.models.enums import (
    Confidence,
    DealStatus,
    DisputeResolution,
    DisputeStatus,
    MilestoneStatus,
    ProposalStatus,
    Role,
    VoiceUpdateStatus,
)

deed_number_seq = Sequence("deed_number_seq", schema=SCHEMA, start=1)


class Deal(Timestamps, Base):
    __tablename__ = "deals"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_id)
    slug: Mapped[str] = mapped_column(String(16), unique=True)
    deed_no: Mapped[int] = mapped_column(
        Integer, deed_number_seq, server_default=deed_number_seq.next_value(), unique=True
    )
    freelancer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    client_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), index=True)
    client_email: Mapped[str | None] = mapped_column(Text)
    title: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[DealStatus] = mapped_column(text_enum(DealStatus, "deal_status"), default=DealStatus.DRAFT)
    draft: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, server_default="{}")
    draft_version: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    terms: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    struck_clauses: Mapped[list[str]] = mapped_column(JSONB, default=list, server_default="[]")
    agreement_nonce: Mapped[str | None] = mapped_column(String(34))
    agreement_canonical: Mapped[str | None] = mapped_column(Text)
    agreement_hash: Mapped[str | None] = mapped_column(String(66))
    total_paise: Mapped[int | None] = mapped_column(BigInteger)
    platform_fee_paise: Mapped[int] = mapped_column(BigInteger, default=0, server_default="0")
    client_fee_paise: Mapped[int] = mapped_column(BigInteger, default=0, server_default="0")
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    pay_by: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    funded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    lapsed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reissued_from_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("deals.id"))

    milestones: Mapped[list["Milestone"]] = relationship(
        back_populates="deal", order_by="Milestone.idx", lazy="selectin", cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint(
            "status = 'draft' OR (agreement_hash IS NOT NULL AND total_paise > 0)", name="published_has_agreement"
        ),
    )


class Milestone(Timestamps, Base):
    __tablename__ = "milestones"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_id)
    deal_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("deals.id", ondelete="CASCADE"), index=True)
    idx: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(Text)
    deliverables: Mapped[str] = mapped_column(Text)
    amount_paise: Mapped[int] = mapped_column(BigInteger)
    platform_fee_paise: Mapped[int] = mapped_column(BigInteger, default=0, server_default="0")
    tds_paise: Mapped[int] = mapped_column(BigInteger, default=0, server_default="0")
    transfer_paise: Mapped[int] = mapped_column(BigInteger)
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    status: Mapped[MilestoneStatus] = mapped_column(
        text_enum(MilestoneStatus, "milestone_status"), default=MilestoneStatus.UNFUNDED
    )
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    delivery_note: Mapped[str | None] = mapped_column(Text)
    review_ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    hold_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    razorpay_transfer_id: Mapped[str | None] = mapped_column(Text, unique=True)
    refund_paise: Mapped[int] = mapped_column(BigInteger, default=0, server_default="0")
    refund_intent: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    released_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    refunded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reminder_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revisions_logged: Mapped[int] = mapped_column(Integer, default=0, server_default="0")

    deal: Mapped[Deal] = relationship(back_populates="milestones")

    __table_args__ = (
        UniqueConstraint("deal_id", "idx", name="uq_milestones_deal_idx"),
        CheckConstraint("amount_paise > 0", name="amount_positive"),
        CheckConstraint("transfer_paise > 0 AND transfer_paise <= amount_paise", name="transfer_within_amount"),
        CheckConstraint("refund_paise >= 0 AND refund_paise <= amount_paise", name="refund_within_amount"),
    )


class Acceptance(Base):
    """The evidence that the client agreed. Immutable: a trigger refuses UPDATE, DELETE and TRUNCATE."""

    __tablename__ = "acceptances"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_id)
    deal_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("deals.id"), unique=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    name_typed: Mapped[str] = mapped_column(Text)
    email: Mapped[str] = mapped_column(Text)
    ip: Mapped[str | None] = mapped_column(INET)
    user_agent: Mapped[str | None] = mapped_column(Text)
    agreement_hash: Mapped[str] = mapped_column(String(66))
    accepted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Dictation(Base):
    __tablename__ = "dictations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_id)
    deal_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("deals.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    field: Mapped[str] = mapped_column(String(64))
    kind: Mapped[str] = mapped_column(String(16))
    raw_text: Mapped[str] = mapped_column(Text)
    normalized_value: Mapped[Any] = mapped_column(JSONB, nullable=True)
    confidence: Mapped[Confidence] = mapped_column(text_enum(Confidence, "confidence"))
    corrected: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    corrected_value: Mapped[Any] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class DealEvent(Base):
    """The register: a human-readable line for everything that happened on a deal."""

    __tablename__ = "deal_events"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    deal_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("deals.id", ondelete="CASCADE"), index=True)
    milestone_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("milestones.id", ondelete="CASCADE"))
    actor_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    actor_role: Mapped[Role] = mapped_column(text_enum(Role, "role"))
    kind: Mapped[str] = mapped_column(String(48))
    summary: Mapped[str] = mapped_column(Text)
    detail: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, server_default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class VoiceUpdate(Base):
    __tablename__ = "voice_updates"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_id)
    deal_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("deals.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    raw_text: Mapped[str] = mapped_column(Text)
    proposed_actions: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)
    applied_indexes: Mapped[list[int]] = mapped_column(JSONB, default=list, server_default=text("'[]'::jsonb"))
    status: Mapped[VoiceUpdateStatus] = mapped_column(
        text_enum(VoiceUpdateStatus, "voice_update_status"), default=VoiceUpdateStatus.PROPOSED
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Dispute(Base):
    __tablename__ = "disputes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_id)
    milestone_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("milestones.id"), index=True)
    deal_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("deals.id"), index=True)
    opened_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    opened_role: Mapped[Role] = mapped_column(text_enum(Role, "role"))
    reason: Mapped[str] = mapped_column(Text)
    status: Mapped[DisputeStatus] = mapped_column(
        text_enum(DisputeStatus, "dispute_status"), default=DisputeStatus.OPEN
    )
    hold_confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolution: Mapped[DisputeResolution | None] = mapped_column(text_enum(DisputeResolution, "dispute_resolution"))
    refund_paise: Mapped[int | None] = mapped_column(BigInteger)
    release_paise: Mapped[int | None] = mapped_column(BigInteger)
    resolved_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Cancellation(Base):
    __tablename__ = "cancellations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_id)
    deal_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("deals.id"), index=True)
    proposed_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    proposed_role: Mapped[Role] = mapped_column(text_enum(Role, "role"))
    reason: Mapped[str] = mapped_column(Text)
    status: Mapped[ProposalStatus] = mapped_column(
        text_enum(ProposalStatus, "proposal_status"), default=ProposalStatus.PROPOSED
    )
    responded_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class DateChange(Base):
    """A proposed new due date. It changes nothing until the other party agrees."""

    __tablename__ = "date_changes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_id)
    deal_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("deals.id"), index=True)
    milestone_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("milestones.id"))
    proposed_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    proposed_role: Mapped[Role] = mapped_column(text_enum(Role, "role"))
    old_due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    new_due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    reason: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[ProposalStatus] = mapped_column(
        text_enum(ProposalStatus, "proposal_status"), default=ProposalStatus.PROPOSED
    )
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
