
from sqlalchemy.orm import Session

from app.db.models import PendingAftercareRecord


def get_pending(
    db: Session,
    user_id:int,
    session_id:str
) -> PendingAftercareRecord | None:
    """查询指定会话、指定用户当前处于待确认状态的操作。"""

    return (
        db.query(PendingAftercareRecord)
        .filter(
            PendingAftercareRecord.user_id == user_id,
            PendingAftercareRecord.session_id==session_id,
            PendingAftercareRecord.status == "pending",
        )
        .first()
    )


def save_pending(
    db: Session,
    user_id:int,
    session_id: str,
    candidate: dict,
) -> PendingAftercareRecord:
    """
    新增或覆盖指定会话和指定用户的待确认操作。

    注意：
    这里只负责数据库新增或更新，不提交事务。
    事务由调用它的 Service 统一管理。
    """

    record = get_pending(db=db, session_id=session_id,user_id=user_id)

    if record is None:
        # 当前会话还没有待确认操作，创建一条。
        record = PendingAftercareRecord(
            session_id=session_id,
            user_id=user_id,
            candidate=candidate,
            status="pending",
        )
        db.add(record)

    else:
        # 当前会话已有待确认操作，更新其候选数据。
        record.candidate = candidate
        record.status = "pending"

    db.flush()
    return record


def delete_pending(
    db: Session,
    session_id: str,
    user_id:int
) -> None:
    """删除指定会话he指定用户的待确认操作，不提交事务。"""

    record = get_pending(db=db, session_id=session_id,user_id=user_id)

    if record is not None:
        db.delete(record)
        db.flush()
