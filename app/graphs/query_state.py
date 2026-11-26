#保存用户消息、模型回复和工具执行结果
from langchain_core.messages import AnyMessage
from langgraph.graph import add_messages
from typing import Annotated
from typing_extensions import TypedDict


class QueryState(TypedDict):
    """
    自然语言业务查询工作流状态
    messages保存用户输入、模型回复和工具执行结果
    add_messages 消息列表的reducer:
     当节点返回新的messages时，会将新消息追加到原消息列表，不是覆盖
    """
    messages:Annotated[list[AnyMessage],add_messages]