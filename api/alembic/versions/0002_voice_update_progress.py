"""Record which actions of a voice update have been applied, so a retry after a failure skips them.

Revision ID: 0002
Revises: 0001
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "voice_updates",
        sa.Column("applied_indexes", JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        schema="vaada",
    )


def downgrade() -> None:
    op.drop_column("voice_updates", "applied_indexes", schema="vaada")
