"""Add the release_stuck flag: a refund went through but the Maker's remaining share wasn't confirmed released.

Revision ID: 0003
Revises: 0002
"""

from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels = None
depends_on = None

BEFORE = (
    "drift",
    "transfer_failed",
    "refund_deadline",
    "refund_stuck",
    "hold_not_confirmed",
    "payment_on_closed_deal",
    "fee_exceeded",
)
AFTER = (*BEFORE, "release_stuck")


def _replace(kinds: tuple[str, ...]) -> None:
    allowed = ", ".join(f"'{k}'" for k in kinds)
    op.execute("ALTER TABLE vaada.reconciliation_flags DROP CONSTRAINT ck_reconciliation_flags_flag_kind")
    op.execute(
        "ALTER TABLE vaada.reconciliation_flags "
        f"ADD CONSTRAINT ck_reconciliation_flags_flag_kind CHECK (kind IN ({allowed}))"
    )


def upgrade() -> None:
    _replace(AFTER)


def downgrade() -> None:
    op.execute("DELETE FROM vaada.reconciliation_flags WHERE kind = 'release_stuck'")
    _replace(BEFORE)
