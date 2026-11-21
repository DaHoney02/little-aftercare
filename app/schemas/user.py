import re

from pydantic import BaseModel, ConfigDict, Field, field_validator


class UserProfileUpdate(BaseModel):
    """个人资料更新请求；只允许修改白名单字段。"""
    nickname: str | None = Field(default=None, min_length=1, max_length=50)
    email: str | None = Field(default=None, max_length=255)

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str | None) -> str | None:
        if value is not None and value.strip():
            # 去除邮箱首尾空格
            value = value.strip()

            # 校验邮箱格式：不能包含空白字符，必须包含 @ 和域名后缀
            if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", value):
                raise ValueError("邮箱格式不正确")

        return value


class UserProfilePublic(BaseModel):
    """个人资料响应模型，明确禁止暴露 password_hash。"""
    id: int
    username: str
    nickname: str | None = None
    email: str | None = None
    avatar_url: str | None = None
    is_active: bool

    model_config = ConfigDict(from_attributes=True)
