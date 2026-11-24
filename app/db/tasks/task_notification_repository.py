from datetime import datetime

from sqlalchemy import select, and_, or_
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.db.models import Task, TaskNotificationRecord

NOTI_ACTIVE_STATUSES = ("pending", "in_progress")
NOTI_STATUS_DISMISSED = "dismissed"
NOTI_STATUS_READ = "read"
NOTI_STATUS_UNREAD = "unread"
MAX_PAGE_SIZE = 100

# 列元数据只算一次：key 用属性名，避免列名/属性名不一致
_NOTI_ATTRS = tuple(
    attr.key for attr in TaskNotificationRecord.__mapper__.column_attrs
)

class TaskNotificationRepository:
    """任务通知数据库操作层。"""

    def __init__(self, db: Session):
        self.db = db

    def create_if_absent(
        self,
        *,
        task_id: int,
        user_id: int,
        reminder_at: datetime,
    ) -> bool:
        """创建任务提醒通知，已存在则跳过。"""

        statement = (
            insert(TaskNotificationRecord)
            .values(
                task_id=task_id,
                user_id=user_id,
                reminder_at=reminder_at,
                status="unread",
            )
            .on_conflict_do_nothing(
                constraint="uq_task_notification_reminder"
            )
            .returning(TaskNotificationRecord.id)
        )

        inserted_id = self.db.execute(statement).scalar_one_or_none()

        return inserted_id is not None



    def list_by_user(
            self,
            user_id: int,
            limit: int = 50,
            offset: int = 0,
            unread_only: bool = False,
    ) -> list[dict]:
        """查询当前用户有效的任务通知，并返回关联任务标题。"""
        noti = TaskNotificationRecord
        limit = max(1, min(limit, MAX_PAGE_SIZE))

        statement = (
            select(noti, Task.title.label("task_title"))
            .join(
                Task,
                and_(noti.task_id == Task.id, Task.user_id == user_id),
            )
            .where(
                noti.user_id == user_id,
                noti.status != NOTI_STATUS_DISMISSED,
            )
        )

        if unread_only:
            # 只关心未读：任务必须仍有效，OR 分支可省
            statement = statement.where(
                noti.status == NOTI_STATUS_UNREAD,
                Task.status.in_(NOTI_ACTIVE_STATUSES),
            )
        else:
            statement = statement.where(
                or_(
                    Task.status.in_(NOTI_ACTIVE_STATUSES),
                    noti.status == NOTI_STATUS_READ,
                )
            )

        statement = (
            statement
            .order_by(noti.created_at.desc(), noti.id.desc())
            .limit(limit)
            .offset(offset)
        )

        rows = self.db.execute(statement).all()
        return [
            {**{key: getattr(notification, key) for key in _NOTI_ATTRS}, "task_title": task_title}
            for notification, task_title in rows
        ]

    def get_by_id(
        self,
        notification_id: int,
        user_id: int,
    ) -> TaskNotificationRecord | None:
        """只查询当前用户自己的通知。"""

        statement = select(TaskNotificationRecord).where(
            TaskNotificationRecord.id == notification_id,
            TaskNotificationRecord.user_id == user_id,
        )

        return self.db.scalar(statement)

    def list_due_tasks(self, now: datetime) -> list[Task]:
        """查询已经到达提醒时间且仍需处理的任务。"""

        statement = (
            select(Task)
            .where(
                Task.reminder_at.is_not(None),
                Task.reminder_at <= now,
                Task.status.in_(["pending", "in_progress"]),
            )
        )

        return list(self.db.scalars(statement).all())

    def dismiss_unread_by_task(self, task_id: int) -> int:
        """
        将指定任务的所有未读通知标记为失效。

        不删除通知记录，保留历史数据。
        只处理 unread，不影响已经 read 的通知。
        """
        from sqlalchemy import update

        statement = (
            update(TaskNotificationRecord)  #批量更新
            .where(
                TaskNotificationRecord.task_id == task_id,
                TaskNotificationRecord.status == "unread",
            )
            .values(status="dismissed")
        )
        result = self.db.execute(statement)
        return result.rowcount or 0