import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, Index, Integer, String, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from vaada.models.base import Base, Timestamps, new_id, text_enum
from vaada.models.enums import FlagKind, LedgerKind, PaymentStatus


class Payment(Timestamps, Base):
    __tablename__ = "payments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_id)
    deal_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("deals.id"), index=True)
    razorpay_order_id: Mapped[str] = mapped_column(Text, unique=True)
    razorpay_payment_id: Mapped[str | None] = mapped_column(Text, unique=True)
    amount_paise: Mapped[int] = mapped_column(BigInteger)
    client_fee_paise: Mapped[int] = mapped_column(BigInteger)
    status: Mapped[PaymentStatus] = mapped_column(
        text_enum(PaymentStatus, "payment_status"), default=PaymentStatus.CREATED
    )
    method: Mapped[str | None] = mapped_column(String(32))
    gateway_fee_paise: Mapped[int | None] = mapped_column(BigInteger)
    gateway_tax_paise: Mapped[int | None] = mapped_column(BigInteger)
    signature_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    captured_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    failure_reason: Mapped[str | None] = mapped_column(Text)


class LedgerEntry(Base):
    """Append-only. A trigger refuses UPDATE, DELETE and TRUNCATE. Amounts are positive; the kind
    carries direction. `idempotency_key` makes replaying the event that caused a row a no-op."""

    __tablename__ = "ledger_entries"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    deal_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("deals.id"), index=True)
    milestone_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("milestones.id"), index=True)
    kind: Mapped[LedgerKind] = mapped_column(text_enum(LedgerKind, "ledger_kind"))
    amount_paise: Mapped[int] = mapped_column(BigInteger)
    razorpay_object_id: Mapped[str] = mapped_column(Text)
    webhook_event_id: Mapped[str | None] = mapped_column(Text)
    idempotency_key: Mapped[str] = mapped_column(Text, unique=True)
    note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    __table_args__ = (CheckConstraint("amount_paise > 0", name="amount_positive"),)


class WebhookEvent(Base):
    __tablename__ = "webhook_events"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    event_id: Mapped[str] = mapped_column(Text, unique=True)
    event_type: Mapped[str] = mapped_column(String(64))
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    error: Mapped[str | None] = mapped_column(Text)

    __table_args__ = (
        Index("ix_webhook_events_unprocessed", "received_at", postgresql_where=text("processed_at IS NULL")),
    )


class ReconciliationFlag(Base):
    """Something a human must look at. Reconciliation raises these and never corrects money state."""

    __tablename__ = "reconciliation_flags"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_id)
    deal_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("deals.id"), index=True)
    milestone_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("milestones.id"))
    kind: Mapped[FlagKind] = mapped_column(text_enum(FlagKind, "flag_kind"))
    summary: Mapped[str] = mapped_column(Text)
    detail: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    first_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolved_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    resolution_note: Mapped[str | None] = mapped_column(Text)

    __table_args__ = (
        Index(
            "uq_reconciliation_flags_open",
            "deal_id",
            text("coalesce(milestone_id, '00000000-0000-0000-0000-000000000000'::uuid)"),
            "kind",
            unique=True,
            postgresql_where=text("resolved_at IS NULL"),
        ),
    )
