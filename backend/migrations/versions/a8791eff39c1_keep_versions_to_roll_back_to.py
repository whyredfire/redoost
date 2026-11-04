"""Keep versions to roll back to

Revision ID: a8791eff39c1
Revises: 9d1fbd65e6d0
Create Date: 2026-11-04 09:49:21.091938

"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "a8791eff39c1"
down_revision: str | Sequence[str] | None = "9d1fbd65e6d0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "version",
        sa.Column("folder", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("slug", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("created_at", sqlmodel.sql.sqltypes.UTCDateTime(), nullable=False),
        sa.Column("retired_at", sqlmodel.sql.sqltypes.UTCDateTime(), nullable=True),
        sa.Column("file_count", sa.Integer(), nullable=False),
        sa.Column("size", sa.BigInteger(), nullable=False),
        sa.Column("spa", sa.Boolean(), nullable=False),
        sa.Column("description", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("files", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.ForeignKeyConstraint(["slug"], ["deployment.slug"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("folder"),
    )
    op.create_index(op.f("ix_version_slug"), "version", ["slug"], unique=False)
    # The served version and the one it replaced, which was kept only briefly, are
    # the versions recorded so far; their sizes come from the files recorded for them
    op.execute(
        """
        INSERT INTO version
            (folder, slug, created_at, retired_at, file_count, size, spa, description, files)
        SELECT
            v.folder,
            v.slug,
            d.created_at,
            CASE WHEN v.folder = d.folder THEN NULL ELSE COALESCE(d.retired_at, now()) END,
            (SELECT count(*) FROM jsonb_each(v.files)),
            (SELECT COALESCE(sum((f.value ->> 'size')::bigint), 0) FROM jsonb_each(v.files) f),
            d.spa,
            '',
            v.files
        FROM version_files v
        JOIN deployment d ON d.slug = v.slug
        """
    )
    op.drop_index(op.f("ix_version_files_slug"), table_name="version_files")
    op.drop_table("version_files")
    op.add_column(
        "deployment", sa.Column("storage_size", sa.BigInteger(), nullable=True)
    )
    op.add_column("deployment", sa.Column("version_count", sa.Integer(), nullable=True))
    # Sites still uploading have no version yet, and count at the size they'll take
    op.execute(
        """
        UPDATE deployment d SET
            storage_size = COALESCE(
                (SELECT sum(size) FROM version WHERE slug = d.slug), d.total_size
            ),
            version_count = (SELECT count(*) FROM version WHERE slug = d.slug)
        """
    )
    op.alter_column("deployment", "storage_size", nullable=False)
    op.alter_column("deployment", "version_count", nullable=False)
    op.drop_column("deployment", "retired_at")
    op.drop_column("deployment", "retired_folder")
    op.drop_column("deployment", "retired_size")


def downgrade() -> None:
    op.add_column(
        "deployment",
        sa.Column("retired_size", sa.BigInteger(), server_default="0", nullable=False),
    )
    op.add_column(
        "deployment",
        sa.Column("retired_folder", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    )
    op.add_column(
        "deployment",
        sa.Column("retired_at", sqlmodel.sql.sqltypes.UTCDateTime(), nullable=True),
    )
    op.drop_column("deployment", "version_count")
    op.drop_column("deployment", "storage_size")
    op.create_table(
        "version_files",
        sa.Column("folder", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("slug", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("files", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.ForeignKeyConstraint(["slug"], ["deployment.slug"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("folder"),
    )
    op.create_index(
        op.f("ix_version_files_slug"), "version_files", ["slug"], unique=False
    )
    # Older releases serve one version and keep one more; the rest are left in storage
    # for cleanup, which deletes folders no site refers to
    op.execute(
        """
        INSERT INTO version_files (folder, slug, files)
        SELECT v.folder, v.slug, v.files
        FROM version v
        JOIN deployment d ON d.slug = v.slug
        WHERE v.folder = d.folder
        """
    )
    op.drop_index(op.f("ix_version_slug"), table_name="version")
    op.drop_table("version")
