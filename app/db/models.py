from datetime import datetime, timezone, date
from typing import Any

from sqlalchemy import Integer, String, Text, DateTime, Date, func, JSON, UniqueConstraint, ForeignKey
from sqlalchemy.orm import Mapped,mapped_column

from app.db.database import Base

# ORM模型（与数据库中的字段相互映射）
class MessageRecord(Base):
    """持久化保存的聊天消息"""
    __tablename__ = "messages"

    id:Mapped[int]=mapped_column(
        Integer,
        primary_key=True,
        index=True
    )
    session_id:Mapped[str]=mapped_column(
        String(100),
        index=True
    )
    role:Mapped[str]=mapped_column(String(20))
    content:Mapped[str]=mapped_column(Text)
    created_at:Mapped[datetime]=mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc)
    )

class AftercareRecord(Base):
    """后援业务记录：管理商品、退货期限和保修信息"""
    __tablename__ = "aftercare_records"

    id:Mapped[int]=mapped_column(
        primary_key=True,
        index=True
    )
    session_id:Mapped[str | None]=mapped_column(
        String(),
        nullable=True,
        index=True
    )

    title: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True
    )
    platform:Mapped[str | None]=mapped_column(
        String(100),
        nullable=True
    )

    purchase_date:Mapped[date | None]=mapped_column(
        Date,
        nullable=True
    )

    return_deadline:Mapped[date | None]=mapped_column(
        Date,
        nullable=True
    )

    warranty_deadline:Mapped[date | None]=mapped_column(
        Date,
        nullable=True
    )

    status:Mapped[str]=mapped_column(
        String(30),
        nullable=False,
        default="pending"
    )

    notes:Mapped[str | None]=mapped_column(
        Text,
        nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now()
    )

    updated_at:Mapped[datetime]=mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now()
    )

class PendingAftercareRecord(Base):
    """保存尚未由用户确认的售后激励记录候选项"""

    __tablename__ = "pending_aftercare_records"

    #一个会话暂时只允许存在一条待确认的记录
    # 确认或取消后，可通一个会话创建下一条
    session_id:Mapped[str]=mapped_column(
        String(128),
        primary_key=True,
        index=True
    )

    #保存LLM提取后的候选数据
    #JSON字段可直接保存字典，不必手动拼接JSON字符串
    candidate:Mapped[dict[str,Any]]=mapped_column(
        JSON,
        nullable=False
    )

    # pending:待确认；confirmed：已确认；cancelled：已取消
    status:Mapped[str]=mapped_column(
        String(20),
        nullable=False,
        default="pending"
    )

    created_at:Mapped[Any]=mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now()
    )

    updated_at:Mapped[Any]=mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now()
    )

class NotificationRecord(Base):
    """用户的一条站内售后提醒"""

    __tablename__ = "notification_records"

    __table_args__ = (
        UniqueConstraint(
            "record_id",
            "deadline_type",
            "deadline",
            "remind_on",
            name="uq_notification_deadline_reminder"
        ),
    )

    id:Mapped[int]=mapped_column(
        primary_key=True,
        index=True
    )

    session_id:Mapped[str]=mapped_column(
        String(128),
        nullable=False,
        index=True
    )

    record_id:Mapped[int]=mapped_column(
        ForeignKey("aftercare_records.id",ondelete="CASCADE"),  #删除后，关联的提醒也被清理
        nullable=False,
        index=True
    )
    # 区分退货和保修期限
    deadline_type:Mapped[str]=mapped_column(
        String(20),
        nullable=False
    )

    deadline:Mapped[date]=mapped_column(
        Date,
        nullable=False
    )

    # 保存这次提醒应该在那天出现
    remind_on:Mapped[date]=mapped_column(
        Date,
        nullable=False
    )
    # 确认未读、已读处理状态
    status:Mapped[str]=mapped_column(
        String(20),
        nullable=False,
        default="unread",
        server_default="unread"
    )

    created_at:Mapped[datetime]=mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now()
    )