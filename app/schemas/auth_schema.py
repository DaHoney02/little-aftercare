from datetime import datetime

from pydantic import BaseModel, Field


# user请求与响应类型
class RegisterRequest(BaseModel):
    """用户注册请求"""
    username:str=Field(
        min_length=3,
        max_length=50,
        description="用户名"
    )
    password:str=Field(
        min_length=8,
        max_length=128,
        description="请输入密码，至少8位"
    )

class LoginRequest(BaseModel):
    """用户登录请求"""
    username:str=Field(min_length=3,max_length=50)
    password:str=Field(min_length=1,max_length=128)

class UserPublic(BaseModel):
    """对外返回用户信息，不包含密码哈希"""
    id:int
    username:str
    nickname:str | None=None
    email:str | None=None
    is_active:bool
    created_at:datetime
    avatar_url:str | None=None

    model_config = {"from_attributes":True}

class TokenResponse(BaseModel):
    """登录成功后返回的Token信息"""
    access_token:str
    token_type:str="bearer"
    expires_in:int
