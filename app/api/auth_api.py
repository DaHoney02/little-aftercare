
"""认证API路由"""
import uuid
from pathlib import Path

from fastapi import APIRouter, status, Request, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.dependencies import get_current_user
from app.db.database import get_db
from app.db.models import User
from app.schemas.auth_schema import RegisterRequest, UserPublic, LoginRequest, TokenResponse
from app.schemas.user import UserProfileUpdate, UserProfilePublic
from app.services.user_service import update_profile
from app.services.auth_service import change_user_password
from app.services.auth_service import register_user, authenticate_user

router=APIRouter(prefix="/auth",tags=["用户认证"])

# 与 main.py 使用同一个项目根目录
BASE_DIR = Path(__file__).resolve().parents[2]
AVATAR_DIR = BASE_DIR / "static" / "avatars"
AVATAR_DIR.mkdir(parents=True, exist_ok=True)

# 只允许常见图片格式
ALLOWED_IMAGE_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}

MAX_AVATAR_SIZE = 2 * 1024 * 1024  # 2MB

@router.post(
    "/register",
    status_code=status.HTTP_201_CREATED
)
def register(
        request:Request,
        data:RegisterRequest,
        db:Session=Depends(get_db)
):
    """用户注册接口"""
    try:
        user=register_user(
            db=db,
            username=data.username,
            password=data.password
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc)
        )from exc
    return {
        "code":201,
        "message":"注册成功",
        "data":UserPublic.model_validate(user),
        "trace_id":getattr(request.state,"trace_id",None)
    }

@router.post("/login")
def login(
        request:Request,
        data:LoginRequest,
        db:Session=Depends(get_db)
):
    """用户登录接口"""
    result=authenticate_user(
        db=db,
        username=data.username,
        password=data.password
    )
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误",
            headers={"WWW-Authenticate":"Bearer"}
        )

    user,access_token=result

    token_data=TokenResponse(
        access_token=access_token,
        expires_in=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES*60
    )

    return {
        "code":200,
        "message":"登陆成功",
        "data":{
            **token_data.model_dump(),
            "user":UserPublic.model_validate(user)
        },
        "trace_id":getattr(request.state,"trace_id",None)
    }

@router.get("/me")
def get_user_info(
        current_user:User=Depends(get_current_user)
):
    """获取当前登录用户信息"""
    return {
        "code":200,
        "message":"获取用户信息成功",
        "data":UserPublic.model_validate(current_user)
    }

@router.patch("/me")
def update_my_profile(
        data: UserProfileUpdate,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
):
    """更新当前登录用户资料；用户身份只从 JWT 获取。"""
    try:
        # exclude_unset=True：未提交的字段保持原值；显式传 null 可清空可空字段
        fields = data.model_dump(exclude_unset=True)
        user = update_profile(db, current_user, fields)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc

    return {
        "code": 200,
        "message": "个人资料更新成功",
        "data": UserProfilePublic.model_validate(user),
    }

class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str = Field(min_length=8, max_length=128)

@router.post("/change-password")
def change_password(
        data: ChangePasswordRequest,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
):
    """修改当前账户密码；旧密码验证成功后才写入新哈希。"""
    try:
        change_user_password(
            db=db,
            user=current_user,
            old_password=data.old_password,
            new_password=data.new_password,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    return {
        "code": 200,
        "message": "密码修改成功，请重新登录",
        "data": None,
    }

@router.post("/me/avatar")
async def upload_avatar(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """上传当前登录用户的头像。"""

    # 1. 检查文件 MIME 类型
    extension = ALLOWED_IMAGE_TYPES.get(file.content_type)

    if not extension:
        raise HTTPException(
            status_code=400,
            detail="仅支持 JPG、PNG、WEBP 图片",
        )

    # 2. 读取文件并检查实际大小
    content = await file.read(MAX_AVATAR_SIZE + 1)

    if len(content) > MAX_AVATAR_SIZE:
        raise HTTPException(
            status_code=400,
            detail="头像不能超过 2MB",
        )

    if not content:
        raise HTTPException(
            status_code=400,
            detail="上传文件不能为空",
        )

    # 3. 使用随机文件名，避免文件覆盖和名称冲突
    filename = f"{uuid.uuid4().hex}{extension}"
    file_path = AVATAR_DIR / filename

    # 4. 保存文件
    file_path.write_bytes(content)

    # 5. 更新当前用户的头像地址
    old_avatar_url = current_user.avatar_url

    current_user.avatar_url = f"/static/avatars/{filename}"

    try:
        db.commit()
        db.refresh(current_user)
    except Exception:
        db.rollback()
        file_path.unlink(missing_ok=True)
        raise
    finally:
        await file.close()

    # 6. 数据库更新成功后，清理旧头像
    if old_avatar_url and old_avatar_url.startswith("/static/avatars/"):
        old_filename = old_avatar_url.rsplit("/", 1)[-1]
        old_path = AVATAR_DIR / old_filename
        old_path.unlink(missing_ok=True)

    return {
        "code": 200,
        "message": "头像上传成功",
        "data": {
            "avatar_url": current_user.avatar_url,
        },
    }