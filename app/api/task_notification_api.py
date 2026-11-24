from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.database import get_db
from app.db.models import User
from app.db.tasks.task_notification_repository import (
    TaskNotificationRepository,
)
from app.schemas.task_notification import TaskNotificationResponse

router = APIRouter(
    prefix="/task-notifications",
    tags=["任务提醒通知"],
)

@router.get(
    "",
    response_model=list[TaskNotificationResponse],
    summary="查询任务提醒通知",
)
def list_task_notifications(
    unread_only: bool = False,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    repository = TaskNotificationRepository(db)

    return repository.list_by_user(
        user_id=current_user.id,
        limit=limit,
        offset=offset,
        unread_only=unread_only,
    )


@router.patch(
    "/{notification_id}/read",
    response_model=TaskNotificationResponse,
    summary="将任务提醒标记为已读",
)
def mark_task_notification_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    repository = TaskNotificationRepository(db)

    notification = repository.get_by_id(
        notification_id=notification_id,
        user_id=current_user.id,
    )

    if notification is None:
        raise HTTPException(
            status_code=404,
            detail="任务提醒不存在",
        )

    try:
        notification.status = "read"
        db.commit()
        db.refresh(notification)
        return notification

    except Exception:
        db.rollback()
        raise