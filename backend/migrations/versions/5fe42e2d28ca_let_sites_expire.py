"""Let sites expire

Revision ID: 5fe42e2d28ca
Revises: 94306ed877d8
Create Date: 2026-11-04 19:40:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from alembic import op

revision: str = "5fe42e2d28ca"
down_revision: str | Sequence[str] | None = "94306ed877d8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "deployment",
        sa.Column("expires_at", sqlmodel.sql.sqltypes.UTCDateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("deployment", "expires_at")
