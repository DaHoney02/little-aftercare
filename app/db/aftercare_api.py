from datetime import date

from fastapi import APIRouter,status,HTTPException
from fastapi.params import Depends, Query
from sqlalchemy.orm import Session

from app.db.aftercare_respository import (
    create_record,
    list_records,
    get_record,
    update_record,
    delete_record, list_upcoming_deadline, list_overdue_deadline, list_notifications, get_notification
)

from app.db.database import get_db
from app.schemas.aftercare import AftercareResponse, AftercareCreate, AftercareUpdate, DeadlineItem, \
    OverdueDeadlineItem, DeadlineOverviewResponse, NotificationResponse
from app.schemas.aftercare_extract import AftercareExtractResult, AftercareExtractRequest
from app.services.aftercare_extractor import AftercareExtractor
from app.services.dealine_service import get_upcoming_deadline_items, get_overdue_deadline_items

router=APIRouter(prefix="/aftercare",tags=["后援记录"])

# 创建记录
@router.post(
    "/",
    response_model=AftercareResponse,
    status_code=status.HTTP_201_CREATED
)
def create_aftercare(
        data:AftercareCreate,
        db:Session=Depends(get_db)
):
    try:
        # 调用repository创建数据库对象  ;
        # data.session_id or "default"->若请求带了“session_id”,就使用，反之，就使用“default”
        record=create_record(db,data,data.session_id or "default")
        db.commit()
        db.refresh(record)  #重新在数据库中读取ORM对象，获取数据库端生成的最新值
        return record
    except Exception:
        db.rollback()
        raise

# 列表查询(api接收查询参数)
@router.get("",response_model=list[AftercareResponse])
def get_aftercare_list(
        session_id:str="default",
        limit:int=Query(default=50,ge=1,le=100),
        offset:int=Query(default=0,ge=0),
        db:Session=Depends(get_db)
):
    return list_records(db,session_id,limit,offset)

@router.post(
    "/extract",
    response_model=AftercareExtractResult,
    summary="AI提取后援事项信息"
)
def extract_aftercare(
        request:AftercareExtractRequest,
)->AftercareExtractResult:
    """从自然语言提取后援事项候选信息，不直接 保存数据库"""
    extractor=AftercareExtractor()
    return extractor.extract(request.text)

#查询到期列表
@router.get(
    "/deadlines/upcoming",
    response_model=list[DeadlineItem]
)
def get_upcoming_deadline(
        session_id:str="default",
        days:int=Query(default=7,ge=1,le=30),
        db:Session=Depends(get_db)
):
    return get_upcoming_deadline_items(
        db=db,
        session_id=session_id,
        days=days
    )

# 已过期
@router.get(
    "/deadlines/overdue",
    response_model=list[OverdueDeadlineItem],
)
def get_overdue_deadlines(
        session_id:str="default",
        db:Session=Depends(get_db)
)->list[OverdueDeadlineItem]:
    return get_overdue_deadline_items(
        db=db,
        session_id=session_id,
    )

@router.get(
    "/deadlines/overview",
    response_model=DeadlineOverviewResponse,
)
def get_deadline_overview(
        session_id:str="default",
        days:int=Query(default=7,ge=1,le=30),
        db:Session=Depends(get_db)
)->DeadlineOverviewResponse:
    return DeadlineOverviewResponse(
        upcoming=get_upcoming_deadline_items(db,session_id,days),
        overdue=get_overdue_deadline_items(db,session_id)
    )


# 提醒
@router.get(
    "/notifications",
    response_model=list[NotificationResponse],
    summary="查询站内提醒"
)
def get_notifications(
        session_id:str="default",
        unread_only:bool=False,
        limit:int=Query(default=50,ge=1,le=100),
        offset:int=Query(default=0,ge=0),
        db:Session=Depends(get_db)
):
    return list_notifications(
        db=db,
        session_id=session_id,
        unread_only=unread_only,
        limit=limit,
        offset=offset
    )

@router.patch(
    "/notifications/{notification_id}/read",
    response_model=NotificationResponse,
    summary="件提醒标记为已读"
)
def mark_notification_read(
        notification_id:int,
        session_id:str,
        db:Session=Depends(get_db)
):
    notification=get_notification(
        db=db,
        notification_id=notification_id,
        session_id=session_id
    )

    if notification is None:
        raise HTTPException(status_code=404,detail="提醒不存在")

    try:
        notification.status="read"
        db.commit()
        db.refresh(notification)
        return notification
    except Exception:
        db.rollback()
        raise

# 详情查询
@router.get("/{record_id}",response_model=AftercareResponse)
def get_aftercare_detail(
        record_id:int,
        session_id:str,
        db:Session=Depends(get_db)
):
    record=get_record(db,record_id,session_id)
    if record is None:
        raise HTTPException(
            status_code=404,
            detail="后援记录不存在"
        )
    return record

# 更新  AftercareResponse请求校验
@router.put("/{record_id}",response_model=AftercareResponse)
def update_aftercare(
        record_id:int,
        session_id:str,
        data:AftercareUpdate,
        db:Session=Depends(get_db)
):
    try:
        record=get_record(db,record_id,session_id)
        if record is None:
            raise HTTPException(
                status_code=404,
                detail="后援记录不存在"
            )
        updated=update_record(db,record,data)
        db.commit()
        db.refresh(updated)
        return updated
    except Exception:
        db.rollback()
        raise

# 删除
@router.delete("/{record_id}",status_code=status.HTTP_204_NO_CONTENT)
def delete_aftercare(
        record_id:int,
        session_id:str,
        db:Session=Depends(get_db)
):
    try:
        record=get_record(db,record_id,session_id)
        if record is None:
            raise HTTPException(
                status_code=404,
                detail="后援记录不存在"
            )
        delete_record(db,record)
        db.commit()
    except Exception:
        db.rollback()
        raise
