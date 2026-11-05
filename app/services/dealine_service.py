from datetime import date

from sqlalchemy.orm import Session

from app.db.aftercare_respository import list_upcoming_deadline, list_overdue_deadline
from app.schemas.aftercare import DeadlineItem, OverdueDeadlineItem


def get_upcoming_deadline_items(
        db:Session,
        session_id:str,
        days:int
)->list[DeadlineItem]:
    """获取未来指定天数内到期的退货或保修事项"""
    today = date.today()
    records = list_upcoming_deadline(
        db=db,
        session_id=session_id,
        days=days
    )
    items = []
    for record in records:
        deadlines = [
            ("return", record.return_deadline),
            ("warranty", record.warranty_deadline)
        ]

        for deadline_type, deadline in deadlines:
            if deadline is None:
                continue

            days_remaining = (deadline - today).days

            if 0 <= days_remaining <= days:
                items.append(
                    DeadlineItem(
                        record_id=record.id,
                        title=record.title or "未命名商品",
                        deadline=deadline,
                        deadline_type=deadline_type,
                        days_remaining=days_remaining
                    )
                )
    items.sort(key=lambda item: item.deadline)
    return items

def get_overdue_deadline_items(
        db:Session,
        session_id:str,
)->list[OverdueDeadlineItem]:
    """获取已过期的退货或保修事项"""
    today=date.today()
    records=list_overdue_deadline(
        db=db,
        session_id=session_id,
    )
    items:list[OverdueDeadlineItem]=[]

    for record in records:
        deadlines = [
            ("return", record.return_deadline),
            ("warranty", record.warranty_deadline),
        ]
        for deadline_type,deadline in deadlines:
            if deadline is None or deadline >today:
                continue

            items.append(
                OverdueDeadlineItem(
                    record_id=record.id,
                    title=record.title or "未命名商品",
                    deadline_type=deadline_type,
                    deadline=deadline,
                    days_overdue=(today - deadline).days
                )

            )
    items.sort(key=lambda item:item.deadline)
    return items