"""Hold offered addresses

Revision ID: 526070b7d2e0
Revises: a8791eff39c1
Create Date: 2026-11-04 18:02:11.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from alembic import op

revision: str = "526070b7d2e0"
down_revision: str | Sequence[str] | None = "a8791eff39c1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "slug_offer",
        sa.Column("slug", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("user_id", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("expires_at", sqlmodel.sql.sqltypes.UTCDateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("slug"),
    )
    op.create_index(
        op.f("ix_slug_offer_expires_at"), "slug_offer", ["expires_at"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_slug_offer_expires_at"), table_name="slug_offer")
    op.drop_table("slug_offer")
