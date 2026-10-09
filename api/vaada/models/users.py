import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from vaada.models.base import Base, Timestamps, new_id, text_enum
from vaada.models.enums import PayoutStatus


class User(Timestamps, Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    email: Mapped[str | None] = mapped_column(Text)
    phone: Mapped[str | None] = mapped_column(Text)
    display_name: Mapped[str | None] = mapped_column(Text)
    handle: Mapped[str | None] = mapped_column(String(40))
    maker_id: Mapped[str | None] = mapped_column(String(66), unique=True)
    is_persona: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        Index("uq_users_email_lower", func.lower(email), unique=True),
        Index("uq_users_handle_lower", func.lower(handle), unique=True),
    )


class PayoutAccount(Timestamps, Base):
    """What we keep of a Route linked account. PAN and the full bank account number go straight
    to Razorpay and are never stored here."""

    __tablename__ = "payout_accounts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_id)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), unique=True)
    razorpay_account_id: Mapped[str | None] = mapped_column(Text, unique=True)
    stakeholder_id: Mapped[str | None] = mapped_column(Text)
    product_config_id: Mapped[str | None] = mapped_column(Text)
    status: Mapped[PayoutStatus] = mapped_column(text_enum(PayoutStatus, "payout_status"), default=PayoutStatus.DRAFT)
    legal_name: Mapped[str | None] = mapped_column(Text)
    business_type: Mapped[str | None] = mapped_column(String(32))
    bank_last4: Mapped[str | None] = mapped_column(String(4))
    ifsc: Mapped[str | None] = mapped_column(String(11))
    requirements: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list, server_default="[]")
    activated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
