from datetime import date, timedelta

from sqlalchemy import select, or_,func
from sqlalchemy.orm import Session

from app.db.models import AftercareRecord, NotificationRecord
from app.schemas.aftercare import AftercareCreate, AftercareUpdate


# 增删查改操作 ---只负责数据访问（没有commit()）
def create_record(
    db: Session,
    data: AftercareCreate,
    session_id:str,
    user_id:int
) -> AftercareRecord:
    """
    创建正式售后记录，
    user_id：确定数据属于哪个用户。
    session_id：保留创建该记录时所属的聊天会话。
    """
    record_data=data.model_dump(
        exclude={"session_id","user_id"}
    )    #将pydantic请求对象转换出字典
    record = AftercareRecord(
        **record_data,  #字典解包
        session_id=session_id,
        user_id=user_id
    )

    db.add(record)  #告诉Session这条“待新增”
    db.flush()  #把SQL发给数据库执行，但没最终提交，之后可回滚
    return record

def get_record(
        db:Session,
        record_id:int,  #确定要修改哪条记录
        user_id:int
)->AftercareRecord | None:
    """查询当前用户的指定售后记录，避免跨用户访问数据。"""

    statement=(
    select(AftercareRecord)
    .where(
        AftercareRecord.id==record_id,
        AftercareRecord.user_id==user_id
    ))
    return db.scalar(statement)

# 列表查询
# _xxx：下划线开头前缀，表示“内部使用”标记
_SORT_COLUMNS = {
    "created_at": AftercareRecord.created_at,
    "purchase_date": AftercareRecord.purchase_date,
    "return_deadline": AftercareRecord.return_deadline,
    "warranty_deadline": AftercareRecord.warranty_deadline,
}

_DEADLINE_FILTERS = {
    "return": (AftercareRecord.return_deadline.is_not(None),),
    "warranty": (AftercareRecord.warranty_deadline.is_not(None),),
    "both": (
        AftercareRecord.return_deadline.is_not(None),
        AftercareRecord.warranty_deadline.is_not(None),
    ),
}

_MAX_LIMIT = 200

def list_records(
    db: Session,
    user_id: int,
    product_id: int | None = None,
    limit: int = 50,
    offset: int = 0,
    keyword: str | None = None,
    status: str | None = None,
    deadline_type: str | None = None,
    sort_by: str = "created_at",
    sort_order: str = "desc",
) -> tuple[list[AftercareRecord],int]:
    """
    查询当前用户的售后记录。

    支持：
    1. 商品名称、平台、备注关键词搜索（不区分大小写）
    2. 售后状态筛选
    3. 退货 / 质保类型筛选
    4. 动态排序 + 分页,并返回符合条件的记录总数
    """
    # ---------- 1. 参数校验（fail fast） ----------
    sort_column = _SORT_COLUMNS.get(sort_by)
    if sort_column is None:
        raise ValueError(f"不支持的排序字段: {sort_by}")

    if sort_order not in ("asc", "desc"):
        raise ValueError(f"不支持的排序方向: {sort_order}")

    if deadline_type is not None and deadline_type not in _DEADLINE_FILTERS:
        raise ValueError(f"不支持的售后类型: {deadline_type}")

    # 防御性分页参数
    limit = max(1, min(limit, _MAX_LIMIT))
    offset = max(0, offset)

    # ---------- 2. 构造查询 ----------
    statement = select(AftercareRecord).where(
        AftercareRecord.user_id == user_id
    )

    # 关键词搜索（用 lower+like 兼容更多数据库；PG 可换回 ilike）
    if keyword and (kw := keyword.strip()):  #:=    python的海象运算符，在表达式内部赋值并返回该值
        pattern = f"%{kw.lower()}%"
        statement = statement.where(
            or_(
                func.lower(AftercareRecord.title).like(pattern),
                func.lower(AftercareRecord.platform).like(pattern),
                func.lower(AftercareRecord.notes).like(pattern),
            )
        )
    if product_id is not None:
        statement = statement.where(
            AftercareRecord.product_id == product_id
        )

    # 状态筛选
    if status:
        statement = statement.where(AftercareRecord.status == status)

    # 售后类型筛选
    if deadline_type:
        statement = statement.where(*_DEADLINE_FILTERS[deadline_type])

    # ----------统计符合条件的总数----------
    count_statement=select(func.count()).select_from(
        statement.order_by(None).subquery()
    )
    total=db.scalar(count_statement) or 0

    # ---------- 3. 排序 ----------
    order_clause = (
        sort_column.asc().nulls_last()
        if sort_order == "asc"
        else sort_column.desc().nulls_last()
    )
    id_clause = (
        AftercareRecord.id.asc()
        if sort_order == "asc"
        else AftercareRecord.id.desc()
    )
    statement = statement.order_by(order_clause, id_clause)

    # ---------- 4. 分页 + 执行 ----------
    statement = statement.limit(limit).offset(offset)
    items=list(db.scalars(statement).all())
    # 返回当前页数据+符合条件的总数
    return items,total

def update_record(
        db:Session,
        record_id:int,
        user_id:int,
        data:AftercareUpdate
)->AftercareRecord | None:
    """
    更新售后记录，只修改用户明确提供的字段

    注意：
    1.不在Repository提交事务
    2.由上层Service统一commit|rollback
    3.flush让SQLAlchemy将修改发送到数据库，但事务尚未最终提交
    """
    record=db.scalar(
        select(AftercareRecord).where(
            AftercareRecord.id==record_id,
            AftercareRecord.user_id==user_id
        )
    )
    if record is None:
        return None
    # exclude_unset:只取请求中明确传入的字段，没有传入的字段不参与更新
    update_data=data.model_dump(
        exclude_unset=True,
        exclude={"id","user_id","session_id"}  #不可修改的字段  <批量复赋值漏洞>
    )

    for field,value in update_data.items():
        setattr(record,field,value)  #=按字段名给ORM对象赋值（eg.=>record.field=value）

    db.flush()
    return record

def delete_record(
        db:Session,
        record_id:int,
        user_id:int
)->bool:
    """
    删除指定的售后记录
    先验证记录归属，在执行删除

    1.只执行删除操作，不提交事务
    最终由Service负责
    """
    record=db.scalar(
        select(AftercareRecord).where(
            AftercareRecord.id==record_id,
            AftercareRecord.user_id==user_id
        )
    )
    if record is None:
        return  False

    db.delete(record)
    db.flush()
    return True

# #截止时间查询
def list_upcoming_deadline(
        db:Session,
        user_id:int,
        days:int=7
)->list[AftercareRecord]:
    """查询当前用户未来指定天数内的截止事项"""

    today=date.today()
    end_date=today+timedelta(days=days)
    statement=(
        select(AftercareRecord)
        .where(
            AftercareRecord.user_id==user_id,
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
        user_id:int,
)->list[AftercareRecord]:
    """查询当前用户已经逾期的售后事项"""

    today=date.today()

    statement=(
        select(AftercareRecord)
        .where(
            AftercareRecord.user_id==user_id,
            AftercareRecord.status != "completed",
            or_(
                AftercareRecord.return_deadline<today,
                AftercareRecord.warranty_deadline<today
            )
        )
    )
    return list(db.scalars(statement).all())

# 通知列表查询
def list_notifications(
        db:Session,
        user_id:int,
        unread_only:bool=False,
        limit:int=50,
        offset:int=0
)->list[NotificationRecord]:
    """查询当前用户的通知列表"""
    statement=(
        select(NotificationRecord)
        .where(NotificationRecord.user_id==user_id)
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
        user_id:int
)->NotificationRecord | None:
    """查询当前用户指定的通知"""
    statement=(select(NotificationRecord)
    .where(
        NotificationRecord.id==notification_id,
        NotificationRecord.user_id==user_id
    ))
    return db.scalar(statement)