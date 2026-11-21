
from sqlalchemy import select, func, or_, asc, desc
from sqlalchemy.orm import Session

from app.db.models import Product
from app.schemas.product import ProductCreate, ProductUpdate


MAX_PAGE_SIZE = 100

# 排序字段白名单：客户端不能直接指定任意数据库字段
SORT_COLUMNS = {
    "created_at": Product.created_at,
    "updated_at": Product.updated_at,
    "name": Product.name,
    "purchase_date": Product.purchase_date,
    "purchase_price": Product.purchase_price,
}

# 允许更新的商品业务字段
UPDATE_FIELDS = {
    "name",
    "brand",
    "model",
    "category",
    "purchase_price",
    "purchase_date",
    "purchase_channel",
    "description",
}

def _get_owned(
    db: Session,
    product_id: int,
    user_id: int
) -> Product | None:
    """查询当前用户自己的商品，供详情、更新、删除复用。"""

    return db.scalar(
        select(Product).where(
            Product.id == product_id,
            Product.user_id == user_id
        )
    )

def create_product(
    db: Session,
    data: ProductCreate,
    user_id: int
) -> Product:
    """创建商品，用户归属由后端注入。"""

    product = Product(
        **data.model_dump(),
        user_id=user_id
    )

    db.add(product)
    db.flush()

    return product

def get_product(
    db: Session,
    product_id: int,
    user_id: int
) -> Product | None:
    """查询商品详情。"""

    return _get_owned(db, product_id, user_id)

def list_products(
    db: Session,
    user_id: int,
    page: int = 1,
    page_size: int = 10,
    keyword: str | None = None,
    category: str | None = None,
    sort_by: str = "created_at",
    sort_order: str = "desc",
) -> tuple[list[Product], int]:
    """商品列表：关键词搜索、分类筛选、排序、分页。"""

    page = max(page, 1)
    page_size = min(max(page_size, 1), MAX_PAGE_SIZE)

    filters = [Product.user_id == user_id]

    # 关键词模糊搜索
    if keyword := (keyword or "").strip():
        pattern = f"%{keyword}%"

        filters.append(
            or_(
                Product.name.ilike(pattern),
                Product.brand.ilike(pattern),
                Product.model.ilike(pattern),
                Product.description.ilike(pattern),
            )
        )

    # 商品分类筛选
    if category := (category or "").strip():
        filters.append(Product.category == category)

    # 统计符合条件的商品数量
    total = (
        db.scalar(
            select(func.count())
            .select_from(Product)
            .where(*filters)
        )
        or 0
    )

    if total == 0:
        return [], 0

    # 排序白名单
    sort_column = SORT_COLUMNS.get(sort_by, Product.created_at)

    # 防止非法排序方向
    order_func = (
        asc if sort_order.lower() == "asc"
        else desc
    )

    # 增加 ID 作为第二排序条件，保证分页顺序稳定
    order_clauses = [
        order_func(sort_column),
        order_func(Product.id)
    ]

    offset = (page - 1) * page_size

    stmt = (
        select(Product)
        .where(*filters)
        .order_by(*order_clauses)
        .offset(offset)
        .limit(page_size)
    )
    products = list(db.scalars(stmt).all())

    return products, total

def update_product(
    db: Session,
    product_id: int,
    user_id: int,
    data: ProductUpdate
) -> Product | None:
    """局部更新商品，只修改明确提交的字段。"""

    product = _get_owned(db, product_id, user_id)

    if product is None:
        return None

    # exclude_unset=True：只获取请求中明确提交的字段
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        # 只允许修改白名单中的业务字段
        if field not in UPDATE_FIELDS:
            continue

        # 商品名称不允许为空
        if field == "name" and (
            value is None or not value.strip()
        ):
            raise ValueError("商品名称不能为空")

        setattr(product, field, value)
    db.flush()

    return product

def delete_product(
    db: Session,
    product_id: int,
    user_id: int
) -> bool:
    """删除当前用户自己的商品。"""

    product = _get_owned(db, product_id, user_id)

    if product is None:
        return False

    db.delete(product)
    db.flush()

    return True
