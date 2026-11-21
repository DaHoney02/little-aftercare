from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import User


def get_user_by_email(db: Session, email: str, exclude_user_id: int | None = None) -> User | None:
    """检查邮箱是否已被其他账户使用。"""
    statement = select(User).where(User.email == email)
    if exclude_user_id is not None:
        statement = statement.where(User.id != exclude_user_id)
    return db.scalar(statement)


def update_user_profile(db: Session, user: User, fields: dict) -> User:
    """只更新调用方已经通过 Schema 校验的资料字段。"""
    for field, value in fields.items():
        setattr(user, field, value)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
