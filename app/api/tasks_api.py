"""Task API：提供任务管理接口。"""
import logging
from typing import Literal

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.database import get_db
from app.db.models import User
from app.schemas.task import (
    TaskCreate,
    TaskUpdate,
    TaskResponse,
    TaskPageResponse,
    TaskStatsResponse
)
from app.services.task_service import TaskService

logger=logging.getLogger(__name__)

router = APIRouter(
    prefix="/tasks",
    tags=["任务管理"],
)

@router.post(
    "",
    response_model=TaskResponse,
    status_code=status.HTTP_201_CREATED,
    summary="创建任务",
)
def create_task(
    task_data: TaskCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """创建当前用户的手动任务。"""

    service = TaskService(db)
    try:
        task = service.create_task(
            user_id=current_user.id,
            task_data=task_data,
        )
        db.commit()
        db.refresh(task)
        return task

    except Exception:
        db.rollback()
        logger.exception(
            "创建任务失败，user_id=%s",
            current_user.id
        )
        raise


@router.get(
    "",
    response_model=TaskPageResponse,
    summary="分页查询任务",
)
def list_tasks(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
    task_status: Literal[
        "pending",
        "in_progress",
        "completed",
        "cancelled",
    ] | None = Query(default=None, alias="status"),
    priority: Literal["low", "medium", "high"] | None = None,
    source_type: Literal["manual", "system", "ai"] | None = None,
    keyword: str | None = Query(default=None, max_length=100),
    source_key:str|None=Query(
            default=None,
            min_length=1,
            max_length=200
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """查询当前用户的任务列表。"""

    service = TaskService(db)

    return service.list_tasks(
        user_id=current_user.id,
        page=page,
        page_size=page_size,
        status=task_status,
        priority=priority,
        keyword=keyword,
        source_type=source_type,
        source_key=source_key
    )

@router.get(
    "/stats",
    response_model=TaskStatsResponse,
    summary="获取当前用户的任务统计"
)
def get_task_stats(
        db:Session=Depends(get_db),
        current_user:User=Depends(get_current_user)
):
    """获取当前用户登录用户的前部任务统计"""
    service=TaskService(db)
    return service.get_task_stats(
        user_id=current_user.id
    )

@router.get(
    "/{task_id}",
    response_model=TaskResponse,
    summary="查询任务详情",
)
def get_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """查询当前用户的指定任务。"""

    service = TaskService(db)

    return service.get_task(
        task_id=task_id,
        user_id=current_user.id,
    )

@router.patch(
    "/{task_id}",
    response_model=TaskResponse,
    summary="局部更新任务",
)
def update_task(
    task_id: int,
    task_data: TaskUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """局部更新任务字段。"""

    service = TaskService(db)

    try:
        task = service.update_task(
            task_id=task_id,
            user_id=current_user.id,
            task_data=task_data,
        )
        db.commit()
        db.refresh(task)
        return task

    except Exception:
        db.rollback()
        raise

@router.delete(
    "/{task_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="删除任务",
)
def delete_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """删除当前用户的指定任务。"""

    service = TaskService(db)
    try:
        service.delete_task(
            task_id=task_id,
            user_id=current_user.id,
        )
        db.commit()
        return None
    except Exception:
        db.rollback()
        raise