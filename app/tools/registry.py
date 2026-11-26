from sqlalchemy.orm import Session

from app.tools.query_tools import (
    build_query_products_tool,
    build_query_aftercare_tool,
    build_query_tasks_tool
)

# 统一注册层(工具集合的组装)
def build_query_tools(
        db:Session,
        user_id:int,
)->list:
    """
    构建当前用户可使用的只读业务查询工具
    """
    tools=[
        build_query_products_tool(db=db,user_id=user_id),
        build_query_aftercare_tool(db=db, user_id=user_id),
        build_query_tasks_tool(db=db, user_id=user_id),
    ]

    tool_names=[tool.name for tool in tools]
    if len(tool_names) != len(set(tool_names)):
        raise  ValueError("查询工具名称不能重复")
    return tools