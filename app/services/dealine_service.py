from datetime import date

from sqlalchemy.orm import Session

from app.db.aftercare.aftercare_respository import list_upcoming_deadline, list_overdue_deadline
from app.schemas.aftercare import DeadlineItem, OverdueDeadlineItem


def get_upcoming_deadline_items(
        db:Session,
        user_id:int,
        days:int
)->list[DeadlineItem]:
    """获取未来指定天数内到期的退货或保修事项"""
    today = date.today()
    records = list_upcoming_deadline(
        db=db,
        user_id=user_id,
        days=days
    )
    items = []
    # 遍历每条记录，分别检查退货日期和保修日期
    for record in records:
        deadlines = [
            ("return", record.return_deadline),
            ("warranty", record.warranty_deadline)
        ]

        for deadline_type, deadline in deadlines:
            if deadline is None:
                continue

            days_remaining = (deadline - today).days

            # 只保留今天及未来指定天数内到期的事项
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
    #             按照截止日期从近到远排序
    items.sort(key=lambda item: item.deadline)
    return items

def get_overdue_deadline_items(
        db:Session,
        user_id:int,
)->list[OverdueDeadlineItem]:
    """获取当前用户已过期的退货或保修事项"""
    today=date.today()
    records=list_overdue_deadline(
        db=db,
        user_id=user_id,
    )
    items:list[OverdueDeadlineItem]=[]

    for record in records:
        deadlines = [
            ("return", record.return_deadline),
            ("warranty", record.warranty_deadline),
        ]
        for deadline_type,deadline in deadlines:
            if deadline is None or deadline >=today:
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