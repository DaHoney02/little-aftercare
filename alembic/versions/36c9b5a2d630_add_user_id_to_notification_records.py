"""add user_id to notification records

Revision ID: 36c9b5a2d630
Revises: 02f932d843a6
Create Date: 2026-11-10 16:01:42.282018

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '36c9b5a2d630'
# 关联当前数据库最新迁移
down_revision: Union[str, Sequence[str], None] = "02f932d843a6"

branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """给通知表添加用户归属字段。"""

    # 1. 先允许为空，避免添加字段时影响已有通知记录
    op.add_column(
        "notification_records",
        sa.Column("user_id", sa.Integer(), nullable=True),
    )

    # 2. 根据关联的售后记录，回填通知所属用户
    op.execute("""
        UPDATE notification_records AS n
        SET user_id = a.user_id
        FROM aftercare_records AS a
        WHERE n.record_id = a.id
    """)

    # 3. 检查是否存在无法确定所属用户的通知
    # 如果存在，抛出异常，让本次迁移事务回滚
    connection = op.get_bind()

    missing_count = connection.execute(
        sa.text("""
            SELECT COUNT(*)
            FROM notification_records
            WHERE user_id IS NULL
        """)
    ).scalar_one()

    if missing_count > 0:
        raise RuntimeError(
            f"发现 {missing_count} 条通知无法关联所属用户，迁移已中止。"
        )

    # 4. 回填完成后，再设置非空约束
    op.alter_column(
        "notification_records",
        "user_id",
        existing_type=sa.Integer(),
        nullable=False,
    )

    # 5. 建立用户外键，用户删除时级联删除对应通知
    op.create_foreign_key(
        "fk_notification_records_user_id_users",
        "notification_records",
        "users",
        ["user_id"],
        ["id"],
        ondelete="CASCADE",
    )

    # 6. 为 user_id 建立索引，提高按用户查询通知的效率
    op.create_index(
        "ix_notification_records_user_id",
        "notification_records",
        ["user_id"],
        unique=False,
    )


def downgrade() -> None:
    """回滚通知表的用户归属字段。"""

    op.drop_index(
        "ix_notification_records_user_id",
        table_name="notification_records",
    )

    op.drop_constraint(
        "fk_notification_records_user_id_users",
        "notification_records",
        type_="foreignkey",
    )

    op.drop_column("notification_records", "user_id")
