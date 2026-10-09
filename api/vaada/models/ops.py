import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from vaada.models.base import Base, new_id, text_enum
from vaada.models.enums import EmailStatus, RegistryKind, RegistryStatus


class RegistryRecord(Base):
    __tablename__ = "registry_records"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_id)
    deal_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("deals.id"), index=True)
    milestone_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("milestones.id"))
    kind: Mapped[RegistryKind] = mapped_column(text_enum(RegistryKind, "registry_kind"))
    deal_hash: Mapped[str] = mapped_column(String(66))
    maker_id: Mapped[str] = mapped_column(String(66))
    ref: Mapped[str] = mapped_column(String(66))
    status: Mapped[RegistryStatus] = mapped_column(
        text_enum(RegistryStatus, "registry_status"), default=RegistryStatus.QUEUED
    )
    tx_hash: Mapped[str | None] = mapped_column(String(66))
    block_number: Mapped[int | None] = mapped_column(BigInteger)
    attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    last_error: Mapped[str | None] = mapped_column(Text)
    next_attempt_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        UniqueConstraint("deal_id", "kind", "ref", name="uq_registry_records_deal_kind_ref"),
        Index("ix_registry_records_pending", "next_attempt_at", postgresql_where=text("status IN ('queued', 'sent')")),
    )


class OutboundEmail(Base):
    __tablename__ = "outbound_emails"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_id)
    deal_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("deals.id"), index=True)
    to_email: Mapped[str] = mapped_column(Text)
    template: Mapped[str] = mapped_column(String(64))
    subject: Mapped[str] = mapped_column(Text)
    html: Mapped[str | None] = mapped_column(Text)
    text_body: Mapped[str | None] = mapped_column(Text)
    status: Mapped[EmailStatus] = mapped_column(text_enum(EmailStatus, "email_status"), default=EmailStatus.QUEUED)
    provider_id: Mapped[str | None] = mapped_column(Text)
    attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    last_error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AppState(Base):
    """Small key-value state. Used for the dev and demo clock offset."""

    __tablename__ = "app_state"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[Any] = mapped_column(JSONB)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
