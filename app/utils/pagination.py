"""公共分页工具：供不同业务模块复用。"""


def calculate_total_pages(total: int, page_size: int) -> int:
    """根据总记录数和每页数量计算总页数。

    total = 0 时，返回 0。
    例如：total=21、page_size=10，返回 3。
    """
    if total < 0:
        raise ValueError("total 不能小于 0")

    if page_size < 1:
        raise ValueError("page_size 必须大于 0")

    return (total + page_size - 1) // page_size


def calculate_offset(page: int, page_size: int) -> int:
    """将从 1 开始的页码转换成数据库 offset。"""
    if page < 1:
        raise ValueError("page 必须大于等于 1")

    if page_size < 1:
        raise ValueError("page_size 必须大于 0")

    return (page - 1) * page_size