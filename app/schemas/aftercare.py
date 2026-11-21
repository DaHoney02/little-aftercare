from datetime import date, datetime

from typing import Literal
from pydantic import BaseModel, Field
from app.schemas.common_schema import PageResponse


class AftercareCreate(BaseModel):
    """创建记录时接受的请求数据"""

    title:str=Field(min_length=1,max_length=200)
    product_id: int | None = None
    platform:str | None=Field(default=None,max_length=100)
    purchase_date:date | None=None
    return_deadline:date | None=None
    warranty_deadline:date | None=None
    status: Literal["pending", "processing", "completed"] = "pending"
    notes:str | None=None
    session_id: str | None = None

class AftercareResponse(BaseModel):
    """返回个客户端的后援记录"""
    id: int
    title: str
    product_id: int | None = None
    platform: str | None
    purchase_date: date | None
    return_deadline: date | None
    warranty_deadline: date | None
    status: str
    notes: str | None
    created_at: datetime
    updated_at: datetime
    session_id: str | None = None

    # 允许pydantic直接读取ORM对象并转换成响应
    model_config = {"from_attributes":True}

class AftercareUpdate(BaseModel):
    """局部更新售后记录，字修改用户明确提供的字段"""
    title:str | None=Field(default=None,max_length=200)
    product_id: int | None = None
    platform:str | None=None
    purchase_date:date | None=None
    return_deadline:date | None=None
    warranty_deadline:date | None=None
    notes:str | None=None
    status:Literal["pending","processing","completed"] | None=None

# 期限
class DeadlineItem(BaseModel):
    record_id:int
    title:str
    deadline_type:Literal["return","warranty"]  #区分退货、保修
    deadline:date  #具体截止日期
    days_remaining:int  #距截止时间还有几天
    task_created:bool=False  #是否已创建对应系统任务

#     已过期模型
class OverdueDeadlineItem(BaseModel):
    record_id: int
    title: str
    deadline_type: Literal["return", "warranty"]
    deadline: date
    days_overdue: int

class DeadlineOverviewResponse(BaseModel):
    upcoming:list[DeadlineItem]
    overdue:list[OverdueDeadlineItem]

class NotificationResponse(BaseModel):
    id:int
    record_id:int
    deadline_type:Literal["return","warranty"]
    deadline:date
    remind_on:date
    status:Literal["unread","read"]
    created_at:datetime
    model_config = {"from_attributes":True}

class AftercarePageResponse(PageResponse[AftercareResponse]):
    """售后记录分页响应模型。"""
    pass