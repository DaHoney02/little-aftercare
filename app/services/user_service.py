from sqlalchemy.orm import Session

from app.db.models import User
from app.db.user_repository import get_user_by_email, update_user_profile


def update_profile(db: Session, user: User, fields: dict) -> User:
    """个人资料业务规则：邮箱唯一性检查后再持久化。"""
    email = fields.get("email")
    if email:
        existing = get_user_by_email(db, email, exclude_user_id=user.id)
        if existing:
            raise ValueError("该邮箱已被其他账户使用")
    return update_user_profile(db, user, fields)
