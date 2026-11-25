from typing import Literal

from fastapi import APIRouter,status,HTTPException
from fastapi.params import Depends, Query
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.database import get_db
from app.db.models import Product, User
from app.db.products.product_repository import (
    create_product,
    list_products,
    get_product,
    update_product,
    delete_product,
    list_product_aftercare_records,
    list_product_credentials,
    list_product_tasks,
)
from app.schemas.product import (
    ProductResponse,
    ProductCreate,
    ProductPageResponse,
    ProductUpdate,
    ProductDetailResponse,
)
from app.utils.pagination import calculate_total_pages

router=APIRouter(
    prefix="/products",
    tags=["商品档案"]
)

def _or_404(product:Product | None)->Product:
    """商品不存在时，统抛出HTTP 404异常"""
    if product is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="商品不存在"
        )
    return product

@router.post(
    "",
    response_model=ProductResponse,
    status_code=status.HTTP_201_CREATED,
    summary="创建商品档案"
)
def create_product_api(
        data:ProductCreate,
        db:Session=Depends(get_db),
        current_user:User=Depends(get_current_user)
)->Product:
    product=create_product(
        db=db,
        data=data,
        user_id=current_user.id
    )
    db.commit()
    db.refresh(product)
    return product

@router.get(
    "",
    response_model=ProductPageResponse,
    summary="查询商品档案"
)
def list_product_api(
        page:int=Query(1,ge=1),
        page_size:int=Query(10,ge=1,le=100),
        keyword: str | None = Query(None, max_length=100),
        category: str | None = Query(None, max_length=100),
        sort_by: Literal["created_at", "updated_at", "name","purchase_date", "purchase_price"] = "created_at",
        sort_order: Literal["asc", "desc"] = "desc",
        db: Session = Depends(get_db),
        current_user: User = Depends(get_current_user),
):
    products,total=list_products(
        db=db,
        user_id=current_user.id,
        page=page,
        page_size=page_size,
        keyword=keyword,
        category=category,
        sort_by=sort_by,
        sort_order=sort_order,
    )
    return {
        "items": products,
        "total": total,
        "page": page,
        "page_size": page_size,
        # total=0 时自然得 0，不需要 if 判断
        "total_pages": calculate_total_pages(total, page_size),
    }

@router.get(
    "/{product_id}",
    response_model=ProductDetailResponse,
    summary="查询商品详情及关联数据",
)
def get_product_detail(
    product_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """查询商品基础信息及关联的售后、凭证和任务。"""

    # 1. 先确认商品属于当前登录用户
    product = _or_404(
        get_product(
            db=db,
            product_id=product_id,
            user_id=current_user.id,
        )
    )

    # 2. 查询商品关联的业务数据
    aftercare_records = list_product_aftercare_records(
        db,
        product_id,
        current_user.id,
    )

    credentials = list_product_credentials(
        db,
        product_id,
        current_user.id,
    )

    tasks = list_product_tasks(
        db,
        product_id,
        current_user.id,
    )

    # 3. 组装聚合响应
    return {
        "id": product.id,
        "user_id": product.user_id,
        "name": product.name,
        "brand": product.brand,
        "model": product.model,
        "category": product.category,
        "purchase_price": product.purchase_price,
        "purchase_date": product.purchase_date,
        "purchase_channel": product.purchase_channel,
        "description": product.description,
        "created_at": product.created_at,
        "updated_at": product.updated_at,
        "aftercare_records": aftercare_records,
        "credentials": credentials,
        "tasks": tasks,
    }

@router.patch("/{product_id}", response_model=ProductResponse, summary="局部更新商品档案")
def update_product_api(
    product_id: int,
    data: ProductUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Product:
    product = _or_404(
        update_product(
            db=db,
            product_id=product_id,
            user_id=current_user.id,
            data=data
        )
    )
    db.commit()
    db.refresh(product)
    return product

@router.delete(
    "/{product_id}",
   status_code=status.HTTP_204_NO_CONTENT,
   summary="删除商品档案"
)
def delete_product_api(
    product_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    if not delete_product(
            db=db,
            product_id=product_id,
            user_id=current_user.id
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="商品不存在"
        )
    db.commit()