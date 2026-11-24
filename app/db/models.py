from datetime import datetime, timezone, date
from decimal import Decimal
from typing import Any

from sqlalchemy import Numeric, Integer, String, Text, DateTime, Date, func, JSON, UniqueConstraint, ForeignKey, Boolean
from sqlalchemy.orm import Mapped,mapped_column
from app.db.database import Base

# ORM模型（与数据库中的字段相互映射）--数据库模型

class User(Base):
    """
    用户表。
    负责保存注册用户基本信息和认证状态
    不保存原始密码，只保存哈希处理的密码
    """
    __tablename__ = "users"

    #用户唯一标识，其他业务表通过user_id关联
    id:Mapped[int]=mapped_column(
        Integer,
        primary_key=True,
        index=True
    )
    #登录用户名，唯一性
    username:Mapped[str]=mapped_column(
        String(50),
        nullable=False,
        unique=True,
        index=True
    )

    #密码哈希值
    password_hash:Mapped[str]=mapped_column(
        String(255),
        nullable=False
    )

    #账户启用状态，默认启用
    is_active:Mapped[bool]=mapped_column(
        Boolean,
        nullable=False,
        default=True,  #由 SQLAlchemy 在插入对象时提供默认值
        server_default="true"  #由 PostgreSQL 在数据库层提供默认值
    )
    # 创建时间
    created_at:Mapped[datetime]=mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now()
    )
    #更新时间
    updated_at:Mapped[datetime]=mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now()
    )

    email:Mapped[str | None]=mapped_column(
        String(255),
        nullable=True,
        index=True
    )

    nickname:Mapped[str| None]=mapped_column(
        String(50),
        nullable=True
    )

    avatar_url:Mapped[str | None]=mapped_column(
        String(500),
        nullable=True
    )

class MessageRecord(Base):
    """持久化保存的聊天消息"""
    __tablename__ = "messages"

    id:Mapped[int]=mapped_column(
        Integer,
        primary_key=True,
        index=True
    )
    user_id:Mapped[int]=mapped_column(
        Integer,
        ForeignKey("users.id",ondelete="CASCADE"),
        nullable=False,
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

class Product(Base):
    """
    商品档案表
    一个用户可以拥有多个商品档案；
    商品档案可以关联多条售后记录
    """
    __tablename__ = "products"

    #商品唯一标识
    id:Mapped[int]=mapped_column(
        Integer,
        primary_key=True,
        index=True
    )
    #商品所属用户
    user_id:Mapped[int]=mapped_column(
        Integer,
        ForeignKey("users.id",ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    name:Mapped[str]=mapped_column(
        String(200),
        nullable=False
    )
    brand:Mapped[str | None]=mapped_column(
        String(100),
        nullable=True,
    )
    # 型号
    model:Mapped[str | None]=mapped_column(
        String(100),
        nullable=True,
    )
    #分类
    category:Mapped[str | None]=mapped_column(
        String(100),
        nullable=True,
        index=True
    )
    #购买价格：使用Numeric保证金额精度
    purchase_price:Mapped[Decimal |None]=mapped_column(
        Numeric(12,2),
        nullable=True
    )
    # 购买日期
    purchase_date: Mapped[date | None] = mapped_column(
        Date,
        nullable=True
    )
    #购买渠道
    purchase_channel:Mapped[str | None]=mapped_column(
        String(100),
        nullable=True
    )
    description:Mapped[str | None]=mapped_column(
        Text,
        nullable=True
    )
    created_at:Mapped[datetime]=mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now()
    )
    # 更新时间
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now()
    )

# 购物凭证ORM模型
class ProductCred(Base):
    """
    商品购物凭证表：
    一个用户可以上传多份凭证
    一份凭证可以关联一个商品，也可暂时不关联
    删除商品时保留凭证，仅将product_id置为NULL
    """
    __tablename__ = "product_cred"
    id:Mapped[int]=mapped_column(
        Integer,
        primary_key=True,
        index=True
    )
    # 删除时清理其凭证记录
    user_id:Mapped[int]=mapped_column(
        Integer,
        ForeignKey("users.id",ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    # 关联商品，允许为空，删除时保留凭证
    product_id:Mapped[int | None]=mapped_column(
        Integer,
        ForeignKey("products.id",ondelete="SET NULL"),
        nullable=True,
        index=True
    )
    file_name:Mapped[str]=mapped_column(
        String(255),
        nullable=False
    )
    # 服务端生成的为文件名，避免重名覆盖
    storage_name:Mapped[str]=mapped_column(
        String(255),
        nullable=False,
        unique=True
    )
    # 文件存储路径
    storage_path:Mapped[str]=mapped_column(
        String(500),
        nullable=False
    )
    # MIME类型：如image/jpeg等
    content_type:Mapped[str]=mapped_column(
        String(100),
        nullable=False
    )
    file_size:Mapped[int]=mapped_column(
        Integer,
        nullable=False
    )
    created_at:Mapped[datetime]=mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now()
    )

class AftercareRecord(Base):
    """后援业务记录：管理商品、退货期限和保修信息"""
    __tablename__ = "aftercare_records"

    id:Mapped[int]=mapped_column(
        primary_key=True,
        index=True
    )
    user_id:Mapped[int]=mapped_column(
        Integer,
        ForeignKey("users.id",ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    #关联商品档案
    product_id:Mapped[int |None]=mapped_column(
        Integer,
        ForeignKey("products.id",ondelete="SET NULL"),
        nullable=True,
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

    # user_id+session_id共同确定一条待确认记录
    user_id:Mapped[int]=mapped_column(
        Integer,
        ForeignKey("users.id",ondelete="CASCADE"),
        primary_key=True,
    )
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
    # 记录本身的主键
    id:Mapped[int]=mapped_column(
        Integer,
        primary_key=True,
    )
    # 所属用户ID，关联users.id
    user_id:Mapped[int]=mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    # 所属聊天会话
    session_id:Mapped[str]=mapped_column(
        String(128),
        nullable=False,
        index=True
    )
    # 关联的售后事务记录
    record_id:Mapped[int]=mapped_column(
        Integer,
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

class Task(Base):
    """
    用户任务表。

    负责管理用户围绕商品售后需要执行的行动：
    - system：系统根据售后期限自动生成
    - manual：用户手动创建
    - ai：AI 后续生成

    任务与售后记录分离：
    售后记录保存业务事实，任务保存用户行动计划。
    """

    __tablename__ = "tasks"

    # 自动任务去重：
    # 同一用户的同一个来源标识只能生成一条任务。
    # source_key 为空时表示普通手动任务，不参与来源去重。
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "source_key",
            name="uq_task_user_source_key"
        ),
    )

    # 任务唯一标识
    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True
    )

    # 任务所属用户，用户删除时级联删除任务
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    # 关联商品，商品删除时保留任务
    product_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("products.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )

    # 关联售后记录，售后记录删除时保留任务
    aftercare_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("aftercare_records.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )

    # 任务标题
    title: Mapped[str] = mapped_column(
        String(200),
        nullable=False
    )

    # 任务描述
    description: Mapped[str | None] = mapped_column(
        Text,
        nullable=True
    )

    # 任务来源：system / manual / ai
    source_type: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="manual",
        server_default="manual"
    )

    # 自动任务来源标识，用于防止重复生成
    # 示例：aftercare:12:return_deadline
    source_key: Mapped[str | None] = mapped_column(
        String(150),
        nullable=True
    )

    # 任务状态：pending / in_progress / completed / cancelled
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="pending",
        server_default="pending",
        index=True
    )

    # 任务优先级：low / medium / high
    priority: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="medium",
        server_default="medium"
    )

    # 计划执行时间
    scheduled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        index=True
    )

    # 提醒时间
    reminder_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True
    )

    # 任务完成时间
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True
    )

    # 用户执行任务后的结果或备注
    result: Mapped[str | None] = mapped_column(
        Text,
        nullable=True
    )

    # 创建时间
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now()
    )

    # 更新时间
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now()
    )

class TaskNotificationRecord(Base):
    """任务提醒通知记录。

    一条任务可以产生多条不同提醒，但同一个提醒时间只能生成一次通知。
    """

    __tablename__ = "task_notification_records"

    __table_args__ = (
        UniqueConstraint(
            "task_id",
            "reminder_at",
            name="uq_task_notification_reminder"
        ),
    )

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True
    )

    # 通知所属用户
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    # 关联任务，任务删除时清理通知
    task_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("tasks.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    # 本次通知对应的提醒时间
    reminder_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False
    )

    # 通知状态：unread / read
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="unread",
        server_default="unread"
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now()
    )
