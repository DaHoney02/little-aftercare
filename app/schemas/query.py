from pydantic import BaseModel, Field
from typing import Literal


class ProductQueryArgs(BaseModel):
    """商品自然语言查询工具参数模型"""

    keyword:str | None=Field(
        default=None,
        max_length=100,
        description="商品名称、品牌、型号或描述的关键词"
    )
    category:str | None=Field(
        default=None,
        max_length=100,
        description="商品分类，例如数码产品、家电、服饰"
    )
    page: int = Field(
        default=1,
        ge=1,
        le=1000,
        description="查询页码",
    )
    page_size: int = Field(
        default=10,
        ge=1,
        le=20,
        description="每页返回数量，最多20条",
    )

class AftercareQueryArgs(BaseModel):
    """售后记录自然语言查询参数。"""

    keyword: str | None = Field(
        default=None,
        max_length=100,
        description="搜索售后记录标题、平台或备注中的关键词",
    )
    product_id: int | None = Field(
        default=None,
        ge=1,
        description="关联的商品档案 ID",
    )
    status: Literal["pending","processing","completed"] | None = Field(
        default=None,
        max_length=30,
        description="售后记录状态",
    )
    deadline_type: Literal["return", "warranty", "both"] | None = Field(
        default=None,
        description="期限类型：return 退货期限，warranty 保修期限，both 两者都有",
    )
    sort_by: Literal[
        "created_at",
        "purchase_date",
        "return_deadline",
        "warranty_deadline",
    ] = Field(
        default="created_at",
        description="排序字段",
    )
    sort_order: Literal["asc", "desc"] = Field(
        default="desc",
        description="排序方向",
    )
    page: int = Field(default=1, ge=1, le=1000)
    page_size: int = Field(default=10, ge=1, le=20)

class TaskQueryArgs(BaseModel):
    """任务自然语言查询参数"""
    keyword:str |None=Field(
        default=None,
        max_length=100,
        description="按任务标题关键词搜索"
    )
    status:Literal["pending","in_progress","completed","cancelled"] |None=Field(
        default=None,
        description="任务状态：待处理、处理中、已完成、已取消"
    )
    source_type:Literal["system","manual","ai"] | None=Field(
        default=None,
        description="任务来源：系统自动生成、用户手动创建、AI创建"
    )
    priority:Literal["low","medium","high"] | None=Field(
        default=None,
        description="任务优先级：低、中、高"
    )

    page:int=Field(
        default=1,
        ge=1,
        le=1000,
        description="查询页码，从1开始"
    )
    page_size:int=Field(
        default=10,
        ge=1,
        le=20,
        description="每页返回数量，最大20"
    )
