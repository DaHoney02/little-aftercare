"""add user profile fields

Revision ID: 7a4c1d9e2b60
Revises: 36c9b5a2d630
Create Date: 2026-11-13
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "7a4c1d9e2b60"
down_revision: Union[str, Sequence[str], None] = "36c9b5a2d630"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 新增字段均允许 NULL，不会要求已有用户补填资料。
    op.add_column("users", sa.Column("nickname", sa.String(length=50), nullable=True))
    op.add_column("users", sa.Column("email", sa.String(length=255), nullable=True))
    op.add_column("users", sa.Column("avatar_url", sa.String(length=500), nullable=True))
    op.create_index("ix_users_email", "users", ["email"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_users_email", table_name="users")
    op.drop_column("users", "avatar_url")
    op.drop_column("users", "email")
    op.drop_column("users", "nickname")
