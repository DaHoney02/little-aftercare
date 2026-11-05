from datetime import date, timedelta

from sqlalchemy import select, or_
from sqlalchemy.orm import Session

from app.db.models import AftercareRecord, NotificationRecord
from app.schemas.aftercare import AftercareCreate, AftercareUpdate


# 增删查改操作 ---只负责数据访问（没有commit()）
def create_record(
    db: Session,
    data: AftercareCreate,
    session_id:str
) -> AftercareRecord:
    """创建正式售后记录，
    """
    record_data=data.model_dump(exclude={"session_id"})    #将pydantic请求对象转换出字典
    record = AftercareRecord(
        **record_data,  #字典解包
        session_id=session_id
    )

    db.add(record)  #告诉Session这条“待新增”
    db.flush()  #把SQL发给数据库执行，但没最终提交，之后可回滚
    return record

def get_record(
        db:Session,
        record_id:int,  #确定要修改哪条记录
        session_id:str,  #限定属于哪个会话
)->AftercareRecord | None:
    """查询指定会话下的售后记录，避免访问其他会话的数据"""

    statement=(
    select(AftercareRecord)
    .where(
        AftercareRecord.id==record_id,
        AftercareRecord.session_id==session_id
    ))
    return db.scalar(statement)

def list_records(
        db:Session,
        session_id:str,
        limit:int=50,
        offset:int=0
)->list[AftercareRecord]:
    """查询指定会话的售后记录，按创建时间倒序分页"""
    statement=(
        select(AftercareRecord)  #准备查询哪种ORM对象
        .where(AftercareRecord.session_id==session_id)
        .order_by(
            AftercareRecord.created_at.desc(),
            AftercareRecord.id.desc()
        )
        .limit(limit)
        .offset(offset)  #跳过前面已经看过的记录
    )
    # 执行查询并获取ORM对象列表
    return list(db.scalars(statement).all())

def update_record(
        db:Session,
        record:AftercareRecord,
        data:AftercareUpdate
)->AftercareRecord:
    """
    更新售后记录，只修改用户明确提供的字段

    注意：
    1.不在Repository提交事务
    2.由上层Service统一commit|rollback
    3.flush让SQLAlchemy将修改发送到数据库，但事务尚未最终提交
    """
    # exclude_unset:只取请求中明确传入的字段，没有传入的字段不参与更新
    update_data=data.model_dump(exclude_unset=True)

    for field,value in update_data.items():
        setattr(record,field,value)  #=按字段名给ORM对象赋值（eg.=record.field=value）

    db.flush()
    return record

def delete_record(
        db:Session,
        record:AftercareRecord
)->None:

    """
    删除指定的售后记录

    1.只执行删除操作，不提交事务
    最终由Service负责
    """
    db.delete(record)
    db.flush()

def list_upcoming_deadline(
        db:Session,
        session_id:str,
        days:int=7
)->list[AftercareRecord]:
    today=date.today()
    end_date=today+timedelta(days=days)
    statement=(
        select(AftercareRecord)
        .where(
            AftercareRecord.session_id==session_id,
            AftercareRecord.status != "completed",
            or_(  #or_：退货/保修截止时间日在范围内    .between():包含起止时间
                AftercareRecord.return_deadline.between(today,end_date),
                AftercareRecord.warranty_deadline.between(today,end_date)
            ),
        )
        .order_by(AftercareRecord.return_deadline.asc())
    )
    return list(db.scalars(statement).all())

def list_overdue_deadline(
        db:Session,
        session_id:str,
)->list[AftercareRecord]:
    today=date.today()

    statement=(
        select(AftercareRecord)
        .where(
            AftercareRecord.session_id==session_id,
            AftercareRecord.status != "completed",
            or_(
                AftercareRecord.return_deadline<today,
                AftercareRecord.warranty_deadline<today
            )
        )
    )
    return list(db.scalars(statement).all())

# 列表查询
def list_notifications(
        db:Session,
        session_id:str,
        unread_only:bool=False,
        limit:int=50,
        offset:int=0
)->list[NotificationRecord]:
    statement=(
        select(NotificationRecord)
        .where(NotificationRecord.session_id==session_id)
        .order_by(
            NotificationRecord.remind_on.desc(),
            NotificationRecord.id.desc()
        )
        .limit(limit)
        .offset(offset)
    )

    if unread_only:
        statement=statement.where(
            NotificationRecord.status=="unread"
        )
    return list(db.scalars(statement).all())

# 单条查询
def get_notification(
        db:Session,
        notification_id:int,
        session_id:str
)->NotificationRecord | None:
    statement=select(NotificationRecord).where(
        NotificationRecord.id==notification_id,
        NotificationRecord.session_id==session_id
    )
    return db.scalar(statement)