from datetime import datetime

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.db.models import Task, TaskNotificationRecord

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
    ) -> list[TaskNotificationRecord]:
        """查询当前用户的任务通知。"""

        statement = select(TaskNotificationRecord).where(
            TaskNotificationRecord.user_id == user_id
        )

        if unread_only:
            statement = statement.where(
                TaskNotificationRecord.status == "unread"
            )

        statement = (
            statement
            .order_by(
                TaskNotificationRecord.created_at.desc(),
                TaskNotificationRecord.id.desc(),
            )
            .limit(limit)
            .offset(offset)
        )

        return list(self.db.scalars(statement).all())

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