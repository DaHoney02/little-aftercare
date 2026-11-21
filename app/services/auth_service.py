
"""实现注册与登录的业务逻辑"""
from sqlalchemy.exc import IntegrityError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import (
    hash_password,
    verify_password, create_access_token
)
from app.db.models import User

def register_user(
        db:Session,
        username:str,
        password:str,
)->User:
    """
    注册用户
    调用流程：API->register_user->密码hash->数据库保存
    """
    #1.检查用户名是否存在
    existing_user=db.scalar(
        select(User).where(User.username==username)
    )
    if existing_user:
        raise ValueError("用户名已存在")

    #2.对明文密码进行Argon2哈希
    hashed_password=hash_password(password)

    #3.创建用户对象
    user=User(
        username=username,
        password_hash=hashed_password
    )

    #4.保存到数据库
    db.add(user)

    try:
        db.commit()
        db.refresh(user)
    except IntegrityError as exc:
        # 防止两个请求同时注册相同用户名
        db.rollback()
        raise ValueError("用户名已存在") from exc

    return user

def authenticate_user(
        db:Session,
        username:str,
        password:str,
)->tuple[User,str] | None:
    """
    验证用户身份并生成JWT

    返回：（User,access_token）:验证成功
          None:用户名或密码错误
    """

    #1、根据用户名查询用户
    user=db.scalar(
        select(User).where(User.username==username)
    )
    #检查用户名是否存在、是否启用
    if not user or not user.is_active:
        return None

    #3、验证密码
    if not verify_password(password,user.password_hash):
        return None

    #4.签发JWT、sub存放用户ID
    access_token=create_access_token(
        subject=str(user.id)
    )
    return user,access_token



def change_user_password(
        db: Session,
        user: User,
        old_password: str,
        new_password: str,
) -> None:
    """验证旧密码后更新密码哈希；永远不保存明文密码。"""
    if not verify_password(old_password, user.password_hash):
        raise ValueError("当前密码不正确")

    if old_password == new_password:
        raise ValueError("新密码不能与当前密码相同")

    user.password_hash = hash_password(new_password)
    db.add(user)
    db.commit()
