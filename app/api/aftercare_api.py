from typing import Literal
from fastapi import APIRouter,status,HTTPException
from fastapi.params import Depends, Query
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.aftercare.aftercare_respository import (
    create_record,
    list_records,
    get_record,
    update_record,
    delete_record, list_notifications, get_notification
)

from app.db.database import get_db
from app.db.models import User
from app.schemas.aftercare import AftercareResponse, AftercareCreate, AftercareUpdate, DeadlineItem, \
    OverdueDeadlineItem, DeadlineOverviewResponse, NotificationResponse, AftercarePageResponse
from app.schemas.aftercare_extract import AftercareExtractResult, AftercareExtractRequest
from app.schemas.task import TaskResponse
from app.services.aftercare_extractor import AftercareExtractor
from app.services.dealine_service import get_upcoming_deadline_items, get_overdue_deadline_items
from app.services.task_service import TaskService
from app.utils.pagination import calculate_total_pages, calculate_offset

router=APIRouter(prefix="/aftercare",tags=["后援记录"])

# 创建记录
@router.post(
    "/",
    response_model=AftercareResponse,
    status_code=status.HTTP_201_CREATED
)
def create_aftercare(
        data:AftercareCreate,
        db:Session=Depends(get_db),
        current_user:User=Depends(get_current_user)
):
    try:
        # 调用repository创建数据库对象  ;
        session_id=data.session_id or "default"

        record=create_record(
            db=db,
            data=data,
            session_id=session_id,
            user_id=current_user.id  #来自已验证的JWT
        )
        db.commit()
        db.refresh(record)  #重新在数据库中读取ORM对象，获取数据库端生成的最新值
        return record
    except Exception:
        db.rollback()
        raise

# 列表查询(api接收查询参数)
@router.get(
    "",
    response_model=AftercarePageResponse,
    summary="查询售后记录列表"
)
def get_aftercare_list(
        product_id: int | None = Query(default=None, ge=1),
        page:int=Query(default=1,ge=1),
        page_size:int=Query(default=10,ge=1,le=100),
        keyword:str | None=Query(default=None,max_length=100),
        status:str |None=Query(default=None,max_length=30),
        deadline_type:Literal["return","warranty","both"] | None=None,
        sort_order:Literal["asc","desc"] ="desc",
        sort_by:Literal[
            "created_at",
            "purchase_date",
            "return_deadline",
            "warranty_deadline"
        ]="created_at",
        db:Session=Depends(get_db),
        current_user:User=Depends(get_current_user)
):
    # 将页码转换成数据库使用offset
    # 统一计算数据库分页偏移量
    offset = calculate_offset(page, page_size)

    items, total = list_records(
        db=db,
        product_id=product_id,
        user_id=current_user.id,
        limit=page_size,
        offset=offset,
        keyword=keyword,
        status=status,
        deadline_type=deadline_type,
        sort_by=sort_by,
        sort_order=sort_order,
    )

    # 统一计算总页数
    total_pages = calculate_total_pages(total, page_size)
    return {
        "items":items,
        "total":total,
        "page":page,
        "page_size":page_size,
        "total_pages":total_pages
    }

@router.post(
    "/extract",
    response_model=AftercareExtractResult,
    summary="AI提取后援事项信息"
)
def extract_aftercare(
        request:AftercareExtractRequest,
        current_user:User=Depends(get_current_user)
)->AftercareExtractResult:
    """从自然语言提取后援事项候选信息，不直接 保存数据库"""
    extractor=AftercareExtractor()
    return extractor.extract(request.text)

#查询截止日期列表
@router.get(
    "/deadlines/upcoming",
    response_model=list[DeadlineItem]
)
def get_upcoming_deadline(
        current_user:User=Depends(get_current_user),
        days:int=Query(default=7,ge=1,le=30),
        db:Session=Depends(get_db)
):
    return get_upcoming_deadline_items(
        db=db,
        user_id=current_user.id,
        days=days
    )

# 已过期
@router.get(
    "/deadlines/overdue",
    response_model=list[OverdueDeadlineItem],
)
def get_overdue_deadlines(
        current_user:User=Depends(get_current_user),
        db:Session=Depends(get_db),
)->list[OverdueDeadlineItem]:
    return get_overdue_deadline_items(
        db=db,
        user_id=current_user.id,
    )

# 截止日期总览
@router.get(
    "/deadlines/overview",
    response_model=DeadlineOverviewResponse,
)
def get_deadline_overview(
        current_user:User=Depends(get_current_user),
        days:int=Query(default=7,ge=1,le=30),
        db:Session=Depends(get_db)
)->DeadlineOverviewResponse:
    return DeadlineOverviewResponse(
        upcoming=get_upcoming_deadline_items(db=db,user_id=current_user.id,days=days),
        overdue=get_overdue_deadline_items(db=db,user_id=current_user.id)
    )


# 提醒
@router.get(
    "/notifications",
    response_model=list[NotificationResponse],
    summary="查询站内提醒"
)
def get_notifications(
        current_user: User = Depends(get_current_user),
        unread_only:bool=False,
        limit:int=Query(default=50,ge=1,le=100),
        offset:int=Query(default=0,ge=0),
        db:Session=Depends(get_db)
):
    return list_notifications(
        db=db,
        user_id=current_user.id,
        unread_only=unread_only,
        limit=limit,
        offset=offset
    )

@router.patch(
    "/notifications/{notification_id}/read",
    response_model=NotificationResponse,
    summary="将提醒标记为已读"
)
def mark_notification_read(
        notification_id:int,
        current_user: User = Depends(get_current_user),
        db:Session=Depends(get_db)
):
    notification=get_notification(
        db=db,
        notification_id=notification_id,
        user_id=current_user.id
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
        current_user: User = Depends(get_current_user),
        db:Session=Depends(get_db)
):
    record=get_record(db=db,record_id=record_id,user_id=current_user.id)
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
        data:AftercareUpdate,
        db:Session=Depends(get_db),
        current_user: User = Depends(get_current_user),

):
    try:
        updated=update_record(
            db=db,
            record_id=record_id,
            user_id=current_user.id,
            data=data
        )

        if updated is None:
            raise HTTPException(
                status_code=404,
                detail="后援记录不存在"
            )
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
        current_user:User=Depends(get_current_user),
        db:Session=Depends(get_db)
):
    try:
        deleted=delete_record(
            db=db,record_id=record_id,user_id=current_user.id)
        if not deleted:
            raise HTTPException(
                status_code=404,
                detail="后援记录不存在"
            )
        db.commit()
    except Exception:
        db.rollback()
        raise

@router.post(
    "/from-deadline/{record_id}/{deadline_type}",
    response_model=TaskResponse,
    status_code=status.HTTP_201_CREATED,
    summary="从售后期限创建任务",
)
def create_task_from_deadline(
    record_id: int,
    deadline_type: Literal["return", "warranty"],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = TaskService(db)

    try:
        task = service.create_task_from_deadline(
            user_id=current_user.id,
            record_id=record_id,
            deadline_type=deadline_type,
        )

        db.commit()
        db.refresh(task)

        return task

    except ValueError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )

    except Exception:
        db.rollback()
        raise