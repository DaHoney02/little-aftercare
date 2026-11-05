"""reconcile aftercare schema

Revision ID: 6c057491bfbb
Revises: eb21e38e9e91
Create Date: 2026-11-03 19:26:03.734656

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6c057491bfbb'
down_revision: Union[str, Sequence[str], None] = 'eb21e38e9e91'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    # 旧迁移里没有 session_id；当前数据库可能已经有。
    columns = {
        column["name"]
        for column in inspector.get_columns("aftercare_records")
    }

    if "session_id" not in columns:
        op.add_column(
            "aftercare_records",
            sa.Column("session_id", sa.String(), nullable=True),
        )

    indexes = {
        index["name"]
        for index in sa.inspect(op.get_bind()).get_indexes("aftercare_records")
    }

    if "ix_aftercare_records_session_id" not in indexes:
        op.create_index(
            "ix_aftercare_records_session_id",
            "aftercare_records",
            ["session_id"],
            unique=False,
        )

    # 旧迁移里没有 pending_aftercare_records 表；当前数据库可能已经有。
    inspector = sa.inspect(op.get_bind())

    if not inspector.has_table("pending_aftercare_records"):
        op.create_table(
            "pending_aftercare_records",
            sa.Column("session_id", sa.String(length=128), nullable=False),
            sa.Column("candidate", sa.JSON(), nullable=False),
            sa.Column(
                "status",
                sa.String(length=20),
                nullable=False,
                server_default="pending",
            ),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.PrimaryKeyConstraint("session_id"),
        )


def downgrade() -> None:
    """Downgrade schema."""
    pass
