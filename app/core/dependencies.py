from fastapi import Depends,HTTPException,status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.chat_service import ChatService
from app.core.security import decode_access_token
from app.db.database import get_db
from app.db.models import User


def get_chat_service(
    db: Session = Depends(get_db),
) -> ChatService:
    """创建绑定当前请求数据库 Session 的聊天服务。"""
    return ChatService(db=db)


# HTTP Bearer 认证方案  :从请求头中提取Bearer Token  <str>
#auto_error=False:没有token时，由我们自己统一处理401
bearer_scheme=HTTPBearer(auto_error=False)

def get_current_user(
    credentials:HTTPAuthorizationCredentials | None=Depends(bearer_scheme),
    db:Session=Depends(get_db)
)->User:
    """
    获取当前登录用户
    调用流程：
    请求头 Authorization
    ->获取JWT:credentials.credentials
    ->验证Token
    ->提取user_id
    ->查询数据库用户
    ->返回User对象
    """
    #1.检查请求是否携带token
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="请先登录",
            headers={"WWW-Authenticate":"Bearer"}
        )

    #2.验证JWT并提取用户ID
    try:
        # decode_access_token:字符串格式，需转换int
        user_id=int(decode_access_token(credentials.credentials))
    except (ValueError,TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="登录凭证无效或已过期",
            headers={"WWW-Authenticate":"Bearer"}
        )

    #3.根据token中的用户ID查询数据库
    user=db.get(User,user_id)

    #4.检查用户是否存在、是否被禁用
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户不存在或已被禁用",
            headers={"WWW-Authenticate":"Bearer"}
        )

    #5.返回当前用户对象
    return user