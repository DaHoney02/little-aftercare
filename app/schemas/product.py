"""Pydantic schema:约束输入的数据、校验、自动报错、定义返回给前端的数据结构，和数据库ORM模型解耦"""
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from app.schemas.common_schema import PageResponse

def validate_product_name(value: str | None) -> str:
    """商品名称不能为空，也不能只包含空格。"""
    if value is None or not value.strip():
        raise ValueError("商品名称不能为空")

    return value.strip()

class ProductCreate(BaseModel):
    """创建商品时的请求数据。"""
    name: str = Field(
        min_length=1,
        max_length=200,
        description="商品名称"
    )

    @field_validator("name")
    @classmethod
    def validate_name(cls, value):
        return validate_product_name(value)
    brand: str | None = Field(default=None, max_length=100)
    model: str | None = Field(default=None, max_length=100)
    category: str | None = Field(default=None, max_length=100)

    # 金额使用 Decimal，避免浮点数精度问题
    purchase_price: Decimal | None = Field(default=None, ge=0)
    purchase_date: date | None = None
    purchase_channel: str | None = Field(default=None, max_length=100)
    description: str | None = None

class ProductUpdate(BaseModel):
    """更新商品时使用，所有字段均可选。"""
    name: str | None = Field(default=None, min_length=1, max_length=200,description="商品名称")
    brand: str | None = Field(default=None, max_length=100)
    model: str | None = Field(default=None, max_length=100)
    category: str | None = Field(default=None, max_length=100)
    purchase_price: Decimal | None = Field(default=None, ge=0)
    purchase_date: date | None = None
    purchase_channel: str | None = Field(default=None, max_length=100)
    description: str | None = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, value):
        return validate_product_name(value)

    @model_validator(mode="after")
    def validate_update_field(self):
        """拒绝没有任何更新字段的请求"""
        if not self.model_fields_set:
            raise ValueError("至少需要提供一个需更新的字段")
        return self


class ProductResponse(BaseModel):
    """商品详情响应。"""
    id: int
    user_id: int
    name: str
    brand: str | None = None
    model: str | None = None
    category: str | None = None
    purchase_price: Decimal | None = None
    purchase_date: date | None = None
    purchase_channel: str | None = None
    description: str | None = None
    created_at: datetime
    updated_at: datetime

    # 允许直接从 SQLAlchemy ORM 对象读取字段
    model_config = ConfigDict(from_attributes=True)

class ProductPageResponse(PageResponse[ProductResponse]):
    """商品分页列表响应模型。"""
    pass
