from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy.dialects.postgresql import insert

from app.db.database import SessionLocal
from app.db.models import AftercareRecord, NotificationRecord

TIMEZONE=ZoneInfo("Asia/Shanghai")
REMIND_DAYS=(7,3,0)  #括号-常量不易被修改

def generate_daily_reminders()->int:
    """扫描函数（所有未完成的售后记录）：
    对"退货期限"和“质保期限”两个时间点，找到期时间生成站内通知
    返回新增数量
    """

    today=datetime.now(TIMEZONE).date()  #当前日期
    db=SessionLocal()

    try:
        records=(
            db.query(AftercareRecord)
            .filter(  #.filter(条件1，条件2)  --and连接
                AftercareRecord.status !="completed",
                AftercareRecord.session_id.is_not(None)  #.is_not()生成IS NOT NULL
            )
            .all()  #返回列表，一次性加载到内存
        )

        reminder_rows=[]

        for record in records:
            deadlines=[
                ("return",record.return_deadline),
                ("warranty",record.warranty_deadline)
            ]

            for deadline_type,deadline in deadlines:
                if deadline is None: #跳过
                    continue

                #判断：期限差7/3/0天时，今天生成一条提醒
                days_remaining=(deadline-today).days

                if days_remaining not in REMIND_DAYS:
                    continue

                reminder_rows.append({
                    "session_id": record.session_id,
                    "record_id":record.id,
                    "deadline_type":deadline_type,
                    "deadline":deadline,
                    "remind_on":today,
                    "status":"unread"
                })

        if not reminder_rows:
            return 0

        #幂等批量插入  （任意次执行，结果一致）
        statement=(
            insert(NotificationRecord)
            .values(reminder_rows)   #批量多行
            .on_conflict_do_nothing(  #重复项被跳过
                constraint="uq_notification_deadline_reminder"
            )
            .returning(NotificationRecord.id)  #返回实际插入的id
        )

        inserted_ids=db.execute(statement).scalars().all()
        db.commit()
        return len(inserted_ids)

    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


