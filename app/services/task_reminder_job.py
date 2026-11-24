import logging
from datetime import datetime, timezone

from app.db.database import SessionLocal
from app.db.tasks.task_notification_repository import (
    TaskNotificationRepository,
)

logger = logging.getLogger(__name__)

# 扫描到达提醒时间的任务，并创建对应的站内通知

def generate_task_reminders() -> int:
    """扫描到达提醒时间的任务并生成通知。

    返回本次新增的通知数量。
    """

    now = datetime.now(timezone.utc)

    db = SessionLocal()

    try:
        repository = TaskNotificationRepository(db)

        # 查询提醒时间已到且仍未完成的任务
        due_tasks = repository.list_due_tasks(now)

        created_count = 0

        for task in due_tasks:
            if repository.create_if_absent(
                task_id=task.id,
                user_id=task.user_id,
                reminder_at=task.reminder_at,
            ):
                created_count += 1

        db.commit()

        logger.info(
            "任务提醒扫描完成，本次新增通知 %s 条",
            created_count,
        )

        return created_count

    except Exception:
        db.rollback()
        logger.exception("任务提醒扫描失败")
        raise

    finally:
        db.close()