from typing import Generic, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")


class PageResponse(BaseModel, Generic[T]):
    """通用分页响应模型。"""

    items: list[T] = Field(description="当前页的数据")
    total: int = Field(ge=0, description="符合查询条件的记录总数")
    page: int = Field(ge=1, description="当前页码，从 1 开始")
    page_size: int = Field(ge=1, description="每页显示的记录数量")
    total_pages: int = Field(ge=0, description="总页数")