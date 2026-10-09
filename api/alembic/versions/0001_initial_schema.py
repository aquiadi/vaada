"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-10-09 19:19:10.261385
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


APPEND_ONLY_TABLES = ("ledger_entries", "acceptances")


def upgrade() -> None:
    op.execute("CREATE SEQUENCE IF NOT EXISTS vaada.deed_number_seq START 1")
    op.create_table(
        "app_state",
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("value", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("key", name=op.f("pk_app_state")),
        schema="vaada",
    )
    op.create_table(
        "users",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("email", sa.Text(), nullable=True),
        sa.Column("phone", sa.Text(), nullable=True),
        sa.Column("display_name", sa.Text(), nullable=True),
        sa.Column("handle", sa.String(length=40), nullable=True),
        sa.Column("maker_id", sa.String(length=66), nullable=True),
        sa.Column("is_persona", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_users")),
        sa.UniqueConstraint("maker_id", name=op.f("uq_users_maker_id")),
        schema="vaada",
    )
    op.create_index("uq_users_email_lower", "users", [sa.literal_column("lower(email)")], unique=True, schema="vaada")
    op.create_index("uq_users_handle_lower", "users", [sa.literal_column("lower(handle)")], unique=True, schema="vaada")
    op.create_table(
        "webhook_events",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("event_id", sa.Text(), nullable=False),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("attempts", sa.Integer(), server_default="0", nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_webhook_events")),
        sa.UniqueConstraint("event_id", name=op.f("uq_webhook_events_event_id")),
        schema="vaada",
    )
    op.create_index(
        "ix_webhook_events_unprocessed",
        "webhook_events",
        ["received_at"],
        unique=False,
        schema="vaada",
        postgresql_where=sa.text("processed_at IS NULL"),
    )
    op.create_table(
        "deals",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("slug", sa.String(length=16), nullable=False),
        sa.Column("deed_no", sa.Integer(), server_default=sa.text("nextval('vaada.deed_number_seq')"), nullable=False),
        sa.Column("freelancer_id", sa.UUID(), nullable=False),
        sa.Column("client_id", sa.UUID(), nullable=True),
        sa.Column("client_email", sa.Text(), nullable=True),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "draft",
                "published",
                "accepted",
                "lapsed",
                "funded",
                "active",
                "completed",
                "disputed",
                "cancelled",
                name="deal_status",
                native_enum=False,
                create_constraint=False,
                length=32,
                schema="vaada",
            ),
            nullable=False,
        ),
        sa.Column("draft", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False),
        sa.Column("draft_version", sa.Integer(), server_default="1", nullable=False),
        sa.Column("terms", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("struck_clauses", postgresql.JSONB(astext_type=sa.Text()), server_default="[]", nullable=False),
        sa.Column("agreement_nonce", sa.String(length=34), nullable=True),
        sa.Column("agreement_canonical", sa.Text(), nullable=True),
        sa.Column("agreement_hash", sa.String(length=66), nullable=True),
        sa.Column("total_paise", sa.BigInteger(), nullable=True),
        sa.Column("platform_fee_paise", sa.BigInteger(), server_default="0", nullable=False),
        sa.Column("client_fee_paise", sa.BigInteger(), server_default="0", nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("pay_by", sa.DateTime(timezone=True), nullable=True),
        sa.Column("funded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("lapsed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reissued_from_id", sa.UUID(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "status = 'draft' OR (agreement_hash IS NOT NULL AND total_paise > 0)",
            name=op.f("ck_deals_published_has_agreement"),
        ),
        sa.CheckConstraint(
            "status IN ('draft', 'published', 'accepted', 'lapsed', 'funded', 'active', 'completed', 'disputed', 'cancelled')",
            name=op.f("ck_deals_deal_status"),
        ),
        sa.ForeignKeyConstraint(["client_id"], ["vaada.users.id"], name=op.f("fk_deals_client_id_users")),
        sa.ForeignKeyConstraint(["freelancer_id"], ["vaada.users.id"], name=op.f("fk_deals_freelancer_id_users")),
        sa.ForeignKeyConstraint(["reissued_from_id"], ["vaada.deals.id"], name=op.f("fk_deals_reissued_from_id_deals")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_deals")),
        sa.UniqueConstraint("deed_no", name=op.f("uq_deals_deed_no")),
        sa.UniqueConstraint("slug", name=op.f("uq_deals_slug")),
        schema="vaada",
    )
    op.create_index(op.f("ix_vaada_deals_client_id"), "deals", ["client_id"], unique=False, schema="vaada")
    op.create_index(op.f("ix_vaada_deals_freelancer_id"), "deals", ["freelancer_id"], unique=False, schema="vaada")
    op.create_table(
        "payout_accounts",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("razorpay_account_id", sa.Text(), nullable=True),
        sa.Column("stakeholder_id", sa.Text(), nullable=True),
        sa.Column("product_config_id", sa.Text(), nullable=True),
        sa.Column(
            "status",
            sa.Enum(
                "draft",
                "under_review",
                "needs_clarification",
                "activated",
                "suspended",
                "rejected",
                name="payout_status",
                native_enum=False,
                create_constraint=False,
                length=32,
                schema="vaada",
            ),
            nullable=False,
        ),
        sa.Column("legal_name", sa.Text(), nullable=True),
        sa.Column("business_type", sa.String(length=32), nullable=True),
        sa.Column("bank_last4", sa.String(length=4), nullable=True),
        sa.Column("ifsc", sa.String(length=11), nullable=True),
        sa.Column("requirements", postgresql.JSONB(astext_type=sa.Text()), server_default="[]", nullable=False),
        sa.Column("activated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "status IN ('draft', 'under_review', 'needs_clarification', 'activated', 'suspended', 'rejected')",
            name=op.f("ck_payout_accounts_payout_status"),
        ),
        sa.ForeignKeyConstraint(["user_id"], ["vaada.users.id"], name=op.f("fk_payout_accounts_user_id_users")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_payout_accounts")),
        sa.UniqueConstraint("razorpay_account_id", name=op.f("uq_payout_accounts_razorpay_account_id")),
        sa.UniqueConstraint("user_id", name=op.f("uq_payout_accounts_user_id")),
        schema="vaada",
    )
    op.create_table(
        "acceptances",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("deal_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("name_typed", sa.Text(), nullable=False),
        sa.Column("email", sa.Text(), nullable=False),
        sa.Column("ip", postgresql.INET(), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("agreement_hash", sa.String(length=66), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["deal_id"], ["vaada.deals.id"], name=op.f("fk_acceptances_deal_id_deals")),
        sa.ForeignKeyConstraint(["user_id"], ["vaada.users.id"], name=op.f("fk_acceptances_user_id_users")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_acceptances")),
        sa.UniqueConstraint("deal_id", name=op.f("uq_acceptances_deal_id")),
        schema="vaada",
    )
    op.create_table(
        "cancellations",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("deal_id", sa.UUID(), nullable=False),
        sa.Column("proposed_by", sa.UUID(), nullable=False),
        sa.Column(
            "proposed_role",
            sa.Enum(
                "maker",
                "client",
                "system",
                "admin",
                name="role",
                native_enum=False,
                create_constraint=False,
                length=32,
                schema="vaada",
            ),
            nullable=False,
        ),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "proposed",
                "confirmed",
                "declined",
                "withdrawn",
                name="proposal_status",
                native_enum=False,
                create_constraint=False,
                length=32,
                schema="vaada",
            ),
            nullable=False,
        ),
        sa.Column("responded_by", sa.UUID(), nullable=True),
        sa.Column("responded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "proposed_role IN ('maker', 'client', 'system', 'admin')", name=op.f("ck_cancellations_role")
        ),
        sa.CheckConstraint(
            "status IN ('proposed', 'confirmed', 'declined', 'withdrawn')",
            name=op.f("ck_cancellations_proposal_status"),
        ),
        sa.ForeignKeyConstraint(["deal_id"], ["vaada.deals.id"], name=op.f("fk_cancellations_deal_id_deals")),
        sa.ForeignKeyConstraint(["proposed_by"], ["vaada.users.id"], name=op.f("fk_cancellations_proposed_by_users")),
        sa.ForeignKeyConstraint(["responded_by"], ["vaada.users.id"], name=op.f("fk_cancellations_responded_by_users")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_cancellations")),
        schema="vaada",
    )
    op.create_index(op.f("ix_vaada_cancellations_deal_id"), "cancellations", ["deal_id"], unique=False, schema="vaada")
    op.create_table(
        "dictations",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("deal_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=True),
        sa.Column("field", sa.String(length=64), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("raw_text", sa.Text(), nullable=False),
        sa.Column("normalized_value", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "confidence",
            sa.Enum(
                "exact",
                "inferred",
                "failed",
                name="confidence",
                native_enum=False,
                create_constraint=False,
                length=32,
                schema="vaada",
            ),
            nullable=False,
        ),
        sa.Column("corrected", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("corrected_value", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("confidence IN ('exact', 'inferred', 'failed')", name=op.f("ck_dictations_confidence")),
        sa.ForeignKeyConstraint(
            ["deal_id"], ["vaada.deals.id"], name=op.f("fk_dictations_deal_id_deals"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["vaada.users.id"], name=op.f("fk_dictations_user_id_users")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_dictations")),
        schema="vaada",
    )
    op.create_index(op.f("ix_vaada_dictations_deal_id"), "dictations", ["deal_id"], unique=False, schema="vaada")
    op.create_table(
        "milestones",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("deal_id", sa.UUID(), nullable=False),
        sa.Column("idx", sa.Integer(), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("deliverables", sa.Text(), nullable=False),
        sa.Column("amount_paise", sa.BigInteger(), nullable=False),
        sa.Column("platform_fee_paise", sa.BigInteger(), server_default="0", nullable=False),
        sa.Column("tds_paise", sa.BigInteger(), server_default="0", nullable=False),
        sa.Column("transfer_paise", sa.BigInteger(), nullable=False),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "unfunded",
                "held",
                "delivered",
                "released",
                "refund_requested",
                "refunded",
                "disputed",
                "resolved",
                "cancelled",
                name="milestone_status",
                native_enum=False,
                create_constraint=False,
                length=32,
                schema="vaada",
            ),
            nullable=False,
        ),
        sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("delivery_note", sa.Text(), nullable=True),
        sa.Column("review_ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("hold_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("razorpay_transfer_id", sa.Text(), nullable=True),
        sa.Column("refund_paise", sa.BigInteger(), server_default="0", nullable=False),
        sa.Column("refund_intent", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("released_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("refunded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reminder_sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revisions_logged", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "status IN ('unfunded', 'held', 'delivered', 'released', 'refund_requested', 'refunded', 'disputed', 'resolved', 'cancelled')",
            name=op.f("ck_milestones_milestone_status"),
        ),
        sa.CheckConstraint("amount_paise > 0", name=op.f("ck_milestones_amount_positive")),
        sa.CheckConstraint(
            "refund_paise >= 0 AND refund_paise <= amount_paise", name=op.f("ck_milestones_refund_within_amount")
        ),
        sa.CheckConstraint(
            "transfer_paise > 0 AND transfer_paise <= amount_paise", name=op.f("ck_milestones_transfer_within_amount")
        ),
        sa.ForeignKeyConstraint(
            ["deal_id"], ["vaada.deals.id"], name=op.f("fk_milestones_deal_id_deals"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_milestones")),
        sa.UniqueConstraint("deal_id", "idx", name="uq_milestones_deal_idx"),
        sa.UniqueConstraint("razorpay_transfer_id", name=op.f("uq_milestones_razorpay_transfer_id")),
        schema="vaada",
    )
    op.create_index(op.f("ix_vaada_milestones_deal_id"), "milestones", ["deal_id"], unique=False, schema="vaada")
    op.create_table(
        "outbound_emails",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("deal_id", sa.UUID(), nullable=True),
        sa.Column("to_email", sa.Text(), nullable=False),
        sa.Column("template", sa.String(length=64), nullable=False),
        sa.Column("subject", sa.Text(), nullable=False),
        sa.Column("html", sa.Text(), nullable=True),
        sa.Column("text_body", sa.Text(), nullable=True),
        sa.Column(
            "status",
            sa.Enum(
                "queued",
                "sent",
                "failed",
                name="email_status",
                native_enum=False,
                create_constraint=False,
                length=32,
                schema="vaada",
            ),
            nullable=False,
        ),
        sa.Column("provider_id", sa.Text(), nullable=True),
        sa.Column("attempts", sa.Integer(), server_default="0", nullable=False),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("status IN ('queued', 'sent', 'failed')", name=op.f("ck_outbound_emails_email_status")),
        sa.ForeignKeyConstraint(["deal_id"], ["vaada.deals.id"], name=op.f("fk_outbound_emails_deal_id_deals")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_outbound_emails")),
        schema="vaada",
    )
    op.create_index(
        op.f("ix_vaada_outbound_emails_deal_id"), "outbound_emails", ["deal_id"], unique=False, schema="vaada"
    )
    op.create_table(
        "payments",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("deal_id", sa.UUID(), nullable=False),
        sa.Column("razorpay_order_id", sa.Text(), nullable=False),
        sa.Column("razorpay_payment_id", sa.Text(), nullable=True),
        sa.Column("amount_paise", sa.BigInteger(), nullable=False),
        sa.Column("client_fee_paise", sa.BigInteger(), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "created",
                "authorized",
                "captured",
                "failed",
                name="payment_status",
                native_enum=False,
                create_constraint=False,
                length=32,
                schema="vaada",
            ),
            nullable=False,
        ),
        sa.Column("method", sa.String(length=32), nullable=True),
        sa.Column("gateway_fee_paise", sa.BigInteger(), nullable=True),
        sa.Column("gateway_tax_paise", sa.BigInteger(), nullable=True),
        sa.Column("signature_verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("captured_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("failure_reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "status IN ('created', 'authorized', 'captured', 'failed')", name=op.f("ck_payments_payment_status")
        ),
        sa.ForeignKeyConstraint(["deal_id"], ["vaada.deals.id"], name=op.f("fk_payments_deal_id_deals")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_payments")),
        sa.UniqueConstraint("razorpay_order_id", name=op.f("uq_payments_razorpay_order_id")),
        sa.UniqueConstraint("razorpay_payment_id", name=op.f("uq_payments_razorpay_payment_id")),
        schema="vaada",
    )
    op.create_index(op.f("ix_vaada_payments_deal_id"), "payments", ["deal_id"], unique=False, schema="vaada")
    op.create_table(
        "voice_updates",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("deal_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("raw_text", sa.Text(), nullable=False),
        sa.Column("proposed_actions", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "proposed",
                "applied",
                "partially_applied",
                "dismissed",
                name="voice_update_status",
                native_enum=False,
                create_constraint=False,
                length=32,
                schema="vaada",
            ),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "status IN ('proposed', 'applied', 'partially_applied', 'dismissed')",
            name=op.f("ck_voice_updates_voice_update_status"),
        ),
        sa.ForeignKeyConstraint(
            ["deal_id"], ["vaada.deals.id"], name=op.f("fk_voice_updates_deal_id_deals"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["vaada.users.id"], name=op.f("fk_voice_updates_user_id_users")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_voice_updates")),
        schema="vaada",
    )
    op.create_index(op.f("ix_vaada_voice_updates_deal_id"), "voice_updates", ["deal_id"], unique=False, schema="vaada")
    op.create_table(
        "date_changes",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("deal_id", sa.UUID(), nullable=False),
        sa.Column("milestone_id", sa.UUID(), nullable=False),
        sa.Column("proposed_by", sa.UUID(), nullable=False),
        sa.Column(
            "proposed_role",
            sa.Enum(
                "maker",
                "client",
                "system",
                "admin",
                name="role",
                native_enum=False,
                create_constraint=False,
                length=32,
                schema="vaada",
            ),
            nullable=False,
        ),
        sa.Column("old_due_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("new_due_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "proposed",
                "confirmed",
                "declined",
                "withdrawn",
                name="proposal_status",
                native_enum=False,
                create_constraint=False,
                length=32,
                schema="vaada",
            ),
            nullable=False,
        ),
        sa.Column("responded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "proposed_role IN ('maker', 'client', 'system', 'admin')", name=op.f("ck_date_changes_role")
        ),
        sa.CheckConstraint(
            "status IN ('proposed', 'confirmed', 'declined', 'withdrawn')", name=op.f("ck_date_changes_proposal_status")
        ),
        sa.ForeignKeyConstraint(["deal_id"], ["vaada.deals.id"], name=op.f("fk_date_changes_deal_id_deals")),
        sa.ForeignKeyConstraint(
            ["milestone_id"], ["vaada.milestones.id"], name=op.f("fk_date_changes_milestone_id_milestones")
        ),
        sa.ForeignKeyConstraint(["proposed_by"], ["vaada.users.id"], name=op.f("fk_date_changes_proposed_by_users")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_date_changes")),
        schema="vaada",
    )
    op.create_index(op.f("ix_vaada_date_changes_deal_id"), "date_changes", ["deal_id"], unique=False, schema="vaada")
    op.create_table(
        "deal_events",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("deal_id", sa.UUID(), nullable=False),
        sa.Column("milestone_id", sa.UUID(), nullable=True),
        sa.Column("actor_id", sa.UUID(), nullable=True),
        sa.Column(
            "actor_role",
            sa.Enum(
                "maker",
                "client",
                "system",
                "admin",
                name="role",
                native_enum=False,
                create_constraint=False,
                length=32,
                schema="vaada",
            ),
            nullable=False,
        ),
        sa.Column("kind", sa.String(length=48), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("detail", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("actor_role IN ('maker', 'client', 'system', 'admin')", name=op.f("ck_deal_events_role")),
        sa.ForeignKeyConstraint(["actor_id"], ["vaada.users.id"], name=op.f("fk_deal_events_actor_id_users")),
        sa.ForeignKeyConstraint(
            ["deal_id"], ["vaada.deals.id"], name=op.f("fk_deal_events_deal_id_deals"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["milestone_id"],
            ["vaada.milestones.id"],
            name=op.f("fk_deal_events_milestone_id_milestones"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_deal_events")),
        schema="vaada",
    )
    op.create_index(op.f("ix_vaada_deal_events_deal_id"), "deal_events", ["deal_id"], unique=False, schema="vaada")
    op.create_table(
        "disputes",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("milestone_id", sa.UUID(), nullable=False),
        sa.Column("deal_id", sa.UUID(), nullable=False),
        sa.Column("opened_by", sa.UUID(), nullable=False),
        sa.Column(
            "opened_role",
            sa.Enum(
                "maker",
                "client",
                "system",
                "admin",
                name="role",
                native_enum=False,
                create_constraint=False,
                length=32,
                schema="vaada",
            ),
            nullable=False,
        ),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "open",
                "resolved",
                name="dispute_status",
                native_enum=False,
                create_constraint=False,
                length=32,
                schema="vaada",
            ),
            nullable=False,
        ),
        sa.Column("hold_confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "resolution",
            sa.Enum(
                "release",
                "refund",
                "split",
                name="dispute_resolution",
                native_enum=False,
                create_constraint=False,
                length=32,
                schema="vaada",
            ),
            nullable=True,
        ),
        sa.Column("refund_paise", sa.BigInteger(), nullable=True),
        sa.Column("release_paise", sa.BigInteger(), nullable=True),
        sa.Column("resolved_by", sa.UUID(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("opened_role IN ('maker', 'client', 'system', 'admin')", name=op.f("ck_disputes_role")),
        sa.CheckConstraint("resolution IN ('release', 'refund', 'split')", name=op.f("ck_disputes_dispute_resolution")),
        sa.CheckConstraint("status IN ('open', 'resolved')", name=op.f("ck_disputes_dispute_status")),
        sa.ForeignKeyConstraint(["deal_id"], ["vaada.deals.id"], name=op.f("fk_disputes_deal_id_deals")),
        sa.ForeignKeyConstraint(
            ["milestone_id"], ["vaada.milestones.id"], name=op.f("fk_disputes_milestone_id_milestones")
        ),
        sa.ForeignKeyConstraint(["opened_by"], ["vaada.users.id"], name=op.f("fk_disputes_opened_by_users")),
        sa.ForeignKeyConstraint(["resolved_by"], ["vaada.users.id"], name=op.f("fk_disputes_resolved_by_users")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_disputes")),
        schema="vaada",
    )
    op.create_index(op.f("ix_vaada_disputes_deal_id"), "disputes", ["deal_id"], unique=False, schema="vaada")
    op.create_index(op.f("ix_vaada_disputes_milestone_id"), "disputes", ["milestone_id"], unique=False, schema="vaada")
    op.create_table(
        "ledger_entries",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("deal_id", sa.UUID(), nullable=False),
        sa.Column("milestone_id", sa.UUID(), nullable=True),
        sa.Column(
            "kind",
            sa.Enum(
                "captured",
                "held",
                "hold_extended",
                "released",
                "reversed",
                "refunded",
                "refund_failed",
                "fee_retained",
                "fee_returned",
                "tds_withheld",
                "tds_returned",
                "transfer_failed",
                name="ledger_kind",
                native_enum=False,
                create_constraint=False,
                length=32,
                schema="vaada",
            ),
            nullable=False,
        ),
        sa.Column("amount_paise", sa.BigInteger(), nullable=False),
        sa.Column("razorpay_object_id", sa.Text(), nullable=False),
        sa.Column("webhook_event_id", sa.Text(), nullable=True),
        sa.Column("idempotency_key", sa.Text(), nullable=False),
        sa.Column("note", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "kind IN ('captured', 'held', 'hold_extended', 'released', 'reversed', 'refunded', 'refund_failed', 'fee_retained', 'fee_returned', 'tds_withheld', 'tds_returned', 'transfer_failed')",
            name=op.f("ck_ledger_entries_ledger_kind"),
        ),
        sa.CheckConstraint("amount_paise > 0", name=op.f("ck_ledger_entries_amount_positive")),
        sa.ForeignKeyConstraint(["deal_id"], ["vaada.deals.id"], name=op.f("fk_ledger_entries_deal_id_deals")),
        sa.ForeignKeyConstraint(
            ["milestone_id"], ["vaada.milestones.id"], name=op.f("fk_ledger_entries_milestone_id_milestones")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_ledger_entries")),
        sa.UniqueConstraint("idempotency_key", name=op.f("uq_ledger_entries_idempotency_key")),
        schema="vaada",
    )
    op.create_index(
        op.f("ix_vaada_ledger_entries_deal_id"), "ledger_entries", ["deal_id"], unique=False, schema="vaada"
    )
    op.create_index(
        op.f("ix_vaada_ledger_entries_milestone_id"), "ledger_entries", ["milestone_id"], unique=False, schema="vaada"
    )
    op.create_table(
        "reconciliation_flags",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("deal_id", sa.UUID(), nullable=False),
        sa.Column("milestone_id", sa.UUID(), nullable=True),
        sa.Column(
            "kind",
            sa.Enum(
                "drift",
                "transfer_failed",
                "refund_deadline",
                "refund_stuck",
                "hold_not_confirmed",
                "payment_on_closed_deal",
                "fee_exceeded",
                name="flag_kind",
                native_enum=False,
                create_constraint=False,
                length=32,
                schema="vaada",
            ),
            nullable=False,
        ),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("detail", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("first_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_by", sa.UUID(), nullable=True),
        sa.Column("resolution_note", sa.Text(), nullable=True),
        sa.CheckConstraint(
            "kind IN ('drift', 'transfer_failed', 'refund_deadline', 'refund_stuck', 'hold_not_confirmed', 'payment_on_closed_deal', 'fee_exceeded')",
            name=op.f("ck_reconciliation_flags_flag_kind"),
        ),
        sa.ForeignKeyConstraint(["deal_id"], ["vaada.deals.id"], name=op.f("fk_reconciliation_flags_deal_id_deals")),
        sa.ForeignKeyConstraint(
            ["milestone_id"], ["vaada.milestones.id"], name=op.f("fk_reconciliation_flags_milestone_id_milestones")
        ),
        sa.ForeignKeyConstraint(
            ["resolved_by"], ["vaada.users.id"], name=op.f("fk_reconciliation_flags_resolved_by_users")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_reconciliation_flags")),
        schema="vaada",
    )
    op.create_index(
        op.f("ix_vaada_reconciliation_flags_deal_id"), "reconciliation_flags", ["deal_id"], unique=False, schema="vaada"
    )
    op.create_index(
        "uq_reconciliation_flags_open",
        "reconciliation_flags",
        ["deal_id", sa.literal_column("coalesce(milestone_id, '00000000-0000-0000-0000-000000000000'::uuid)"), "kind"],
        unique=True,
        schema="vaada",
        postgresql_where=sa.text("resolved_at IS NULL"),
    )
    op.create_table(
        "registry_records",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("deal_id", sa.UUID(), nullable=False),
        sa.Column("milestone_id", sa.UUID(), nullable=True),
        sa.Column(
            "kind",
            sa.Enum(
                "Published",
                "Accepted",
                "Funded",
                "Delivered",
                "Released",
                "Refunded",
                "Disputed",
                "Resolved",
                "Cancelled",
                name="registry_kind",
                native_enum=False,
                create_constraint=False,
                length=32,
                schema="vaada",
            ),
            nullable=False,
        ),
        sa.Column("deal_hash", sa.String(length=66), nullable=False),
        sa.Column("maker_id", sa.String(length=66), nullable=False),
        sa.Column("ref", sa.String(length=66), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "queued",
                "sent",
                "confirmed",
                "failed",
                name="registry_status",
                native_enum=False,
                create_constraint=False,
                length=32,
                schema="vaada",
            ),
            nullable=False,
        ),
        sa.Column("tx_hash", sa.String(length=66), nullable=True),
        sa.Column("block_number", sa.BigInteger(), nullable=True),
        sa.Column("attempts", sa.Integer(), server_default="0", nullable=False),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "kind IN ('Published', 'Accepted', 'Funded', 'Delivered', 'Released', 'Refunded', 'Disputed', 'Resolved', 'Cancelled')",
            name=op.f("ck_registry_records_registry_kind"),
        ),
        sa.CheckConstraint(
            "status IN ('queued', 'sent', 'confirmed', 'failed')", name=op.f("ck_registry_records_registry_status")
        ),
        sa.ForeignKeyConstraint(["deal_id"], ["vaada.deals.id"], name=op.f("fk_registry_records_deal_id_deals")),
        sa.ForeignKeyConstraint(
            ["milestone_id"], ["vaada.milestones.id"], name=op.f("fk_registry_records_milestone_id_milestones")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_registry_records")),
        sa.UniqueConstraint("deal_id", "kind", "ref", name="uq_registry_records_deal_kind_ref"),
        schema="vaada",
    )
    op.create_index(
        "ix_registry_records_pending",
        "registry_records",
        ["next_attempt_at"],
        unique=False,
        schema="vaada",
        postgresql_where=sa.text("status IN ('queued', 'sent')"),
    )
    op.create_index(
        op.f("ix_vaada_registry_records_deal_id"), "registry_records", ["deal_id"], unique=False, schema="vaada"
    )
    op.execute(
        """
        CREATE FUNCTION vaada.refuse_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            RAISE EXCEPTION '% on %.% is not allowed: this table is append-only', TG_OP, TG_TABLE_SCHEMA, TG_TABLE_NAME
                USING ERRCODE = 'insufficient_privilege';
        END;
        $$
        """
    )
    for table in APPEND_ONLY_TABLES:
        op.execute(
            f"CREATE TRIGGER {table}_no_update_delete BEFORE UPDATE OR DELETE ON vaada.{table} "
            "FOR EACH ROW EXECUTE FUNCTION vaada.refuse_mutation()"
        )
        op.execute(
            f"CREATE TRIGGER {table}_no_truncate BEFORE TRUNCATE ON vaada.{table} "
            "FOR EACH STATEMENT EXECUTE FUNCTION vaada.refuse_mutation()"
        )
    # Supabase exposes `public` through its REST API to these roles; our schema stays closed to them.
    op.execute(
        """
        DO $$
        DECLARE r text;
        BEGIN
            FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
                IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
                    EXECUTE format('REVOKE ALL ON SCHEMA vaada FROM %I', r);
                    EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA vaada FROM %I', r);
                    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA vaada REVOKE ALL ON TABLES FROM %I', r);
                END IF;
            END LOOP;
        END;
        $$
        """
    )


def downgrade() -> None:
    for table in APPEND_ONLY_TABLES:
        op.execute(f"DROP TRIGGER IF EXISTS {table}_no_update_delete ON vaada.{table}")
        op.execute(f"DROP TRIGGER IF EXISTS {table}_no_truncate ON vaada.{table}")
    op.execute("DROP FUNCTION IF EXISTS vaada.refuse_mutation()")
    op.drop_index(op.f("ix_vaada_registry_records_deal_id"), table_name="registry_records", schema="vaada")
    op.drop_index(
        "ix_registry_records_pending",
        table_name="registry_records",
        schema="vaada",
        postgresql_where=sa.text("status IN ('queued', 'sent')"),
    )
    op.drop_table("registry_records", schema="vaada")
    op.drop_index(
        "uq_reconciliation_flags_open",
        table_name="reconciliation_flags",
        schema="vaada",
        postgresql_where=sa.text("resolved_at IS NULL"),
    )
    op.drop_index(op.f("ix_vaada_reconciliation_flags_deal_id"), table_name="reconciliation_flags", schema="vaada")
    op.drop_table("reconciliation_flags", schema="vaada")
    op.drop_index(op.f("ix_vaada_ledger_entries_milestone_id"), table_name="ledger_entries", schema="vaada")
    op.drop_index(op.f("ix_vaada_ledger_entries_deal_id"), table_name="ledger_entries", schema="vaada")
    op.drop_table("ledger_entries", schema="vaada")
    op.drop_index(op.f("ix_vaada_disputes_milestone_id"), table_name="disputes", schema="vaada")
    op.drop_index(op.f("ix_vaada_disputes_deal_id"), table_name="disputes", schema="vaada")
    op.drop_table("disputes", schema="vaada")
    op.drop_index(op.f("ix_vaada_deal_events_deal_id"), table_name="deal_events", schema="vaada")
    op.drop_table("deal_events", schema="vaada")
    op.drop_index(op.f("ix_vaada_date_changes_deal_id"), table_name="date_changes", schema="vaada")
    op.drop_table("date_changes", schema="vaada")
    op.drop_index(op.f("ix_vaada_voice_updates_deal_id"), table_name="voice_updates", schema="vaada")
    op.drop_table("voice_updates", schema="vaada")
    op.drop_index(op.f("ix_vaada_payments_deal_id"), table_name="payments", schema="vaada")
    op.drop_table("payments", schema="vaada")
    op.drop_index(op.f("ix_vaada_outbound_emails_deal_id"), table_name="outbound_emails", schema="vaada")
    op.drop_table("outbound_emails", schema="vaada")
    op.drop_index(op.f("ix_vaada_milestones_deal_id"), table_name="milestones", schema="vaada")
    op.drop_table("milestones", schema="vaada")
    op.drop_index(op.f("ix_vaada_dictations_deal_id"), table_name="dictations", schema="vaada")
    op.drop_table("dictations", schema="vaada")
    op.drop_index(op.f("ix_vaada_cancellations_deal_id"), table_name="cancellations", schema="vaada")
    op.drop_table("cancellations", schema="vaada")
    op.drop_table("acceptances", schema="vaada")
    op.drop_table("payout_accounts", schema="vaada")
    op.drop_index(op.f("ix_vaada_deals_freelancer_id"), table_name="deals", schema="vaada")
    op.drop_index(op.f("ix_vaada_deals_client_id"), table_name="deals", schema="vaada")
    op.drop_table("deals", schema="vaada")
    op.drop_index(
        "ix_webhook_events_unprocessed",
        table_name="webhook_events",
        schema="vaada",
        postgresql_where=sa.text("processed_at IS NULL"),
    )
    op.drop_table("webhook_events", schema="vaada")
    op.drop_index("uq_users_handle_lower", table_name="users", schema="vaada")
    op.drop_index("uq_users_email_lower", table_name="users", schema="vaada")
    op.drop_table("users", schema="vaada")
    op.drop_table("app_state", schema="vaada")
    op.execute("DROP SEQUENCE IF EXISTS vaada.deed_number_seq")
