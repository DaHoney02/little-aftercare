
"""任务模块 Pydantic schema"""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator, ConfigDict

from app.schemas.common_schema import PageResponse

TaskStatus=Literal[
    "pending",
    "in_progress",
    "completed",
    "cancelled"
]
#任务优先级
TaskPriority=Literal[
    "low",
    "medium",
    "high"
]
class TaskCreate(BaseModel):
    """创建任务的请求模型"""
    title:str=Field(
        min_length=1,
        max_length=200,
        description="任务标题"
    )
    description:str|None=Field(
        default=None,
        description="任务详细描述"
    )
    product_id:int | None=Field(
        default=None,
        gt=0,
        description="关联商品ID"
    )
    aftercare_id:int | None=Field(
        default=None,
        gt=0,
        description="关联售后记录ID"
    )
    priority:TaskPriority=Field(
        default="medium",
        description="任务优先级"
    )
    scheduled_at:datetime| None=Field(
        default=None,
        description="计划执行时间"
    )
    reminder_at:datetime |None=Field(
        default=None,
        description="任务提醒时间"
    )

    @model_validator(mode="after")
    def validate_reminder_time(self):
        """提醒时间不能晚于计划执行时间。"""

        if (
                self.reminder_at is not None
                and self.scheduled_at is not None
                and self.reminder_at > self.scheduled_at
        ):
            raise ValueError("提醒时间不能晚于计划执行时间")
        return self

class TaskUpdate(BaseModel):
    """更新任务的请求模型，支持局部更新。"""

    title: str | None = Field(
        default=None,
        min_length=1,
        max_length=200,
        description="任务标题",
    )

    description: str | None = Field(
        default=None,
        description="任务详细描述",
    )

    product_id: int | None = Field(
        default=None,
        gt=0,
        description="关联商品 ID",
    )

    aftercare_id: int | None = Field(
        default=None,
        gt=0,
        description="关联售后记录 ID",
    )

    status: TaskStatus | None = Field(
        default=None,
        description="任务状态",
    )

    priority: TaskPriority | None = Field(
        default=None,
        description="任务优先级",
    )

    scheduled_at: datetime | None = Field(
        default=None,
        description="计划执行时间",
    )

    reminder_at: datetime | None = Field(
        default=None,
        description="任务提醒时间",
    )

    result: str | None = Field(
        default=None,
        description="任务执行结果",
    )

    @model_validator(mode="after")
    def validate_reminder_time(self):
        """校验本次提交的提醒时间和计划时间。"""

        if (
            self.reminder_at is not None
            and self.scheduled_at is not None
            and self.reminder_at > self.scheduled_at
        ):
            raise ValueError("提醒时间不能晚于计划执行时间")

        return self

class TaskResponse(BaseModel):
    """任务详情响应模型。"""

    model_config = ConfigDict(from_attributes=True)
    id: int
    user_id: int

    product_id: int | None
    aftercare_id: int | None

    title: str
    description: str | None

    source_type: str
    source_key: str | None

    status: TaskStatus
    priority: TaskPriority

    scheduled_at: datetime | None
    reminder_at: datetime | None
    completed_at: datetime | None

    result: str | None
    created_at: datetime
    updated_at: datetime

class TaskPageResponse(PageResponse[TaskResponse]):
    """任务分页响应模型。"""

    pass

class TaskStatsResponse(BaseModel):
    """当前用户的任务统计响应模型"""
    total:int=Field(default=0,ge=0,description="任务总数")
    pending:int=Field(default=0,ge=0,description="待处理数量")
    in_progress: int = Field(default=0, ge=0, description="进行中数量")
    completed: int = Field(default=0, ge=0, description="已完成数量")
    cancelled: int = Field(default=0, ge=0, description="已取消数量")
    overdue: int = Field(default=0, ge=0, description="逾期任务数量")
    high_priority: int = Field(default=0, ge=0, description="高优先级任务数量")