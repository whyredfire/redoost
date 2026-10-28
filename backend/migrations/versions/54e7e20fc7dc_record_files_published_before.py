"""Record the files of sites published before

Revision ID: 54e7e20fc7dc
Revises: b0585e1a8c06
Create Date: 2026-10-28 09:28:53.518463

"""

import json
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.util import await_only

from src.storage import read_objects

revision: str = "54e7e20fc7dc"
down_revision: str | Sequence[str] | None = "b0585e1a8c06"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Read from storage once here, so the API never has to
    connection = op.get_bind()
    sites = connection.execute(
        sa.text(
            "SELECT slug, folder FROM deployment WHERE state = 'ready'"
            " AND folder IS NOT NULL AND folder NOT IN (SELECT folder FROM version_files)"
        )
    ).all()
    for slug, folder in sites:
        # Migrations run inside the async engine, which can wait for this
        stored = await_only(read_objects(folder))
        files = {
            path: {"sha256": item.sha256, "size": item.size}
            for path, item in stored.items()
        }
        connection.execute(
            sa.text(
                "INSERT INTO version_files (folder, slug, files)"
                " VALUES (:folder, :slug, CAST(:files AS jsonb))"
            ),
            {"folder": folder, "slug": slug, "files": json.dumps(files)},
        )


def downgrade() -> None:
    # The recorded files stay correct, so there's nothing to undo
    pass
