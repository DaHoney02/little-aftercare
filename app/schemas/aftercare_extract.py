
from datetime import date

from pydantic import BaseModel, Field


class AftercareExtractRequest(BaseModel):
    """AI 信息提取接口的请求参数。"""

    text: str = Field(
        min_length=1,
        max_length=2000,
        description="用户描述后援事项的自然语言",
    )


class AftercareExtractResult(BaseModel):
    """
    AI 信息提取结果。

    保存模型提取出的候选信息，以及需要用户补充或确认的内容。
    """

    title: str | None = Field(
        default=None,
        description="商品或事项名称",
    )

    platform: str | None = Field(
        default=None,
        description="购买平台或商家",
    )

    purchase_date: date | None = Field(
        default=None,
        description="购买日期；无法确定时为空",
    )

    return_deadline: date | None = Field(
        default=None,
        description="退货截止日期；无法确定时为空",
    )

    warranty_deadline: date | None = Field(
        default=None,
        description="保修截止日期；无法确定时为空",
    )

    notes: str | None = Field(
        default=None,
        description="其他有用的事项信息",
    )

    missing_fields: list[str] = Field(
        default_factory=list,
        description="仍然缺失、需要用户补充的字段",
    )

    needs_confirmation: bool = Field(
        default=True,
        description="是否需要用户确认提取结果",
    )


from typing import Literal

class AftercareUpdateExtractResult(BaseModel):
    """
    AI 修改信息提取结果。

    所有字段都是可选的：
    - 用户明确要求修改的字段才应该出现在模型输出中。
    - 未提及的字段不参与更新。
    """

    title: str | None = Field(
        default=None,
        description="需要修改的商品或事项名称",
    )

    platform: str | None = Field(
        default=None,
        description="需要修改的购买平台或商家",
    )

    purchase_date: date | None = Field(
        default=None,
        description="需要修改的购买日期",
    )

    return_deadline: date | None = Field(
        default=None,
        description="需要修改的退货截止日期",
    )

    warranty_deadline: date | None = Field(
        default=None,
        description="需要修改的保修截止日期",
    )

    notes: str | None = Field(
        default=None,
        description="需要修改的备注",
    )

    status: Literal["pending", "processing", "completed"] | None = Field(
        default=None,
        description="需要修改的记录状态",
    )