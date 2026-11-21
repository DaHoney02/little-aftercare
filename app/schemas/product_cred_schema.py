from datetime import datetime

from pydantic import BaseModel, ConfigDict, model_validator


class ProductCredResponse(BaseModel):
    """购物凭证响应结构"""

    id: int
    product_id: int | None
    file_name: str
    display_type: str | None = None
    content_type: str
    file_size: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

    @model_validator(mode="after")
    def set_display_type(self):
        """根据 MIME 类型计算前端展示类型"""

        if self.content_type.startswith("image/"):
            self.display_type = "image"
        elif self.content_type == "application/pdf":
            self.display_type = "pdf"
        else:
            self.display_type = "other"

        return self