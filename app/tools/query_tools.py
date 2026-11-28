
from datetime import date, datetime
from decimal import Decimal

from langchain_core.tools import StructuredTool
from sqlalchemy.orm import Session

from app.db.aftercare.aftercare_respository import list_records
from app.db.products.product_repository import list_products
from app.db.tasks.task_repository import TaskRepository
from app.schemas.query import (
    ProductQueryArgs,
    AftercareQueryArgs,
    TaskQueryArgs,
)

"""
只读查询工具

职责：
1. 接收大模型生成并经过 Schema 校验的查询参数。
2. 注入当前请求的数据库 Session 和用户身份。
3. 调用对应 Repository 查询数据库。
4. 将 ORM 对象序列化为适合大模型处理的字典。
5. 通过 StructuredTool 暴露给 LangGraph。

安全原则：
db 和 user_id 由服务端注入，不允许大模型自行传递。
所有查询必须限制在当前登录用户的数据范围内。
"""

# ============================================================
# 一、商品查询工具
# ============================================================

def _query_products(
    keyword: str | None,
    category: str | None,
    page: int,
    page_size: int,
    *,
    db: Session,
    user_id: int,
) -> dict:
    """
    查询当前登录用户的商品档案。

    接收经过校验的查询参数，
    注入用户身份和数据库 Session，调用 Repository。
    """

    products, total = list_products(
        db=db,
        user_id=user_id,
        keyword=keyword,
        category=category,
        page=page,
        page_size=page_size,
    )

    # 将商品 ORM 对象转换为普通字典，
    # 避免直接将 SQLAlchemy 对象交给大模型。
    items = [
        {
            "id": product.id,
            "name": product.name,
            "brand": product.brand,
            "model": product.model,
            "category": product.category,
            "purchase_price": (
                str(product.purchase_price)
                if product.purchase_price is not None
                else None
            ),
            "purchase_date": (
                product.purchase_date.isoformat()
                if product.purchase_date
                else None
            ),
            "purchase_channel": product.purchase_channel,
        }
        for product in products
    ]

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size,
    }


def build_query_products_tool(
    db: Session,
    user_id: int,
) -> StructuredTool:
    """
    创建绑定当前请求数据库和用户身份的商品查询工具。

    使用内部普通函数包装原始查询函数，
    通过闭包绑定 db 和 user_id。

    这样 LangGraph 可以正常解析工具函数的类型注解，
    避免 functools.partial 引起的 get_type_hints 异常。
    """

    def query_products(
        keyword: str | None = None,
        category: str | None = None,
        page: int = 1,
        page_size: int = 10,
    ) -> dict:
        """查询当前登录用户自己的商品档案。"""

        return _query_products(
            keyword=keyword,
            category=category,
            page=page,
            page_size=page_size,
            db=db,
            user_id=user_id,
        )

    return StructuredTool.from_function(
        func=query_products,
        name="query_products",
        description=(
            "查询当前登录用户自己的商品档案。"
            "适用于查询商品名称、品牌、型号、分类、购买价格等信息。"
            "可以根据关键词或商品分类筛选。"
        ),
        args_schema=ProductQueryArgs,
    )


# ============================================================
# 二、售后记录查询工具
# ============================================================

def _serialize_aftercare(record) -> dict:
    """
    将售后 ORM 对象转换成适合交给大模型的字典。
    """

    def serialize_value(value):
        """处理日期、时间和 Decimal 类型。"""

        if isinstance(value, (date, datetime)):
            return value.isoformat()

        if isinstance(value, Decimal):
            return str(value)

        return value

    return {
        "id": record.id,
        "product_id": record.product_id,
        "title": record.title,
        "platform": record.platform,
        "purchase_date": serialize_value(record.purchase_date),
        "return_deadline": serialize_value(record.return_deadline),
        "warranty_deadline": serialize_value(record.warranty_deadline),
        "status": record.status,
        "notes": record.notes,
    }


def _query_aftercare_records(
    *,
    db: Session,
    user_id: int,
    keyword: str | None = None,
    product_id: int | None = None,
    status: str | None = None,
    deadline_type: str | None = None,
    sort_by: str = "created_at",
    sort_order: str = "desc",
    page: int = 1,
    page_size: int = 10,
) -> dict:
    """
    查询当前登录用户的售后记录。
    """

    # Repository 使用 limit + offset，
    # 因此在工具层计算分页偏移量。
    offset = (page - 1) * page_size

    items, total = list_records(
        db=db,
        user_id=user_id,
        product_id=product_id,
        keyword=keyword,
        status=status,
        deadline_type=deadline_type,
        sort_by=sort_by,
        sort_order=sort_order,
        limit=page_size,
        offset=offset,
    )

    return {
        "items": [
            _serialize_aftercare(record)
            for record in items
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size,
    }


def build_query_aftercare_tool(
    db: Session,
    user_id: int,
) -> StructuredTool:
    """
    构建绑定当前数据库会话和用户身份的售后查询工具。

    使用闭包绑定数据库 Session 和用户 ID，
    不将敏感参数暴露给大模型。
    """

    def query_aftercare_records(
        keyword: str | None = None,
        product_id: int | None = None,
        status: str | None = None,
        deadline_type: str | None = None,
        sort_by: str = "created_at",
        sort_order: str = "desc",
        page: int = 1,
        page_size: int = 10,
    ) -> dict:
        """查询当前登录用户的售后记录。"""

        return _query_aftercare_records(
            db=db,
            user_id=user_id,
            keyword=keyword,
            product_id=product_id,
            status=status,
            deadline_type=deadline_type,
            sort_by=sort_by,
            sort_order=sort_order,
            page=page,
            page_size=page_size,
        )

    return StructuredTool.from_function(
        func=query_aftercare_records,
        name="query_aftercare_records",
        description=(
            "查询当前登录用户的售后记录。"
            "可按关键词、商品ID、售后状态、退货或保修期限筛选，"
            "支持排序和分页。"
        ),
        args_schema=AftercareQueryArgs,
    )


# ============================================================
# 三、任务查询工具
# ============================================================

def _serialize_task(task) -> dict:
    """
    将 Task ORM 对象转换为可交给 LLM 的字典格式。
    """

    def serialize_value(value):
        """处理日期、时间和 Decimal 类型。"""

        if isinstance(value, (date, datetime)):
            return value.isoformat()

        if isinstance(value, Decimal):
            return str(value)

        return value

    return {
        "id": task.id,
        "product_id": task.product_id,
        "aftercare_id": task.aftercare_id,
        "title": task.title,
        "description": task.description,
        "source_type": task.source_type,
        "status": task.status,
        "priority": task.priority,
        "scheduled_at": serialize_value(task.scheduled_at),
        "reminder_at": serialize_value(task.reminder_at),
        "completed_at": serialize_value(task.completed_at),
        "result": task.result,
        "created_at": serialize_value(task.created_at),
    }


def _query_tasks(
    *,
    db: Session,
    user_id: int,
    page: int = 1,
    page_size: int = 10,
    status: str | None = None,
    keyword: str | None = None,
    source_type: str | None = None,
    priority: str | None = None,
) -> dict:
    """
    查询当前登录用户的任务。
    """

    repository = TaskRepository(db)

    items, total = repository.list_tasks(
        user_id=user_id,
        page=page,
        page_size=page_size,
        status=status,
        keyword=keyword,
        source_type=source_type,
        priority=priority,
    )

    return {
        "items": [
            _serialize_task(task)
            for task in items
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size,
    }


def build_query_tasks_tool(
    db: Session,
    user_id: int,
) -> StructuredTool:
    """
    构建绑定当前数据库会话和用户身份的任务查询工具。
    """

    def query_tasks(
        page: int = 1,
        page_size: int = 10,
        status: str | None = None,
        keyword: str | None = None,
        source_type: str | None = None,
        priority: str | None = None,
    ) -> dict:
        """查询当前登录用户的任务列表。"""

        return _query_tasks(
            db=db,
            user_id=user_id,
            page=page,
            page_size=page_size,
            status=status,
            keyword=keyword,
            source_type=source_type,
            priority=priority,
        )

    return StructuredTool.from_function(
        func=query_tasks,
        name="query_tasks",
        description=(
            "查询当前登录用户的任务列表。"
            "可按任务标题关键词、任务状态、任务来源和优先级筛选，"
            "支持分页。"
            "用户询问待办、已完成、正在处理或高优先级任务时使用。"
        ),
        args_schema=TaskQueryArgs,
    )
