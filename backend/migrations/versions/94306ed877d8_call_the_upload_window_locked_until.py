"""Call the upload window locked_until

Revision ID: 94306ed877d8
Revises: 526070b7d2e0
Create Date: 2026-11-04 19:10:00.000000

"""

from collections.abc import Sequence

from alembic import op

revision: str = "94306ed877d8"
down_revision: str | Sequence[str] | None = "526070b7d2e0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column("deployment", "expires_at", new_column_name="locked_until")
    op.execute(
        "ALTER INDEX ix_deployment_state_expires_at "
        "RENAME TO ix_deployment_state_locked_until"
    )


def downgrade() -> None:
    op.execute(
        "ALTER INDEX ix_deployment_state_locked_until "
        "RENAME TO ix_deployment_state_expires_at"
    )
    op.alter_column("deployment", "locked_until", new_column_name="expires_at")
