from datetime import datetime

from typing import Literal
from pydantic import BaseModel, ConfigDict


class TaskNotificationResponse(BaseModel):
    """任务通知响应模型。"""

    model_config = ConfigDict(from_attributes=True)

    id: int
    task_id: int
    task_title: str |None=None
    reminder_at: datetime
    status: Literal["unread", "read","dismissed"]
    created_at: datetime