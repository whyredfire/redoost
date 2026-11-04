"""Keep profile pictures

Revision ID: 3caf283cca3f
Revises: 5fe42e2d28ca
Create Date: 2026-11-04 20:30:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from alembic import op

revision: str = "3caf283cca3f"
down_revision: str | Sequence[str] | None = "5fe42e2d28ca"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("picture", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "picture")
