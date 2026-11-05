from typing import Literal

from pydantic import BaseModel,Field


# schema定义模型允许返回的意图类型
class IntentRequest(BaseModel):
    """意图识别请求"""
    text:str=Field(
        min_length=1,
        max_length=2000,
        description="用户当前发送的消息"
    )

class IntentResult(BaseModel):
    """意图识别结果，不包含数据库操作"""
    intent:Literal[
        "chat",
        "create_aftercare",
        "query_aftercare",
        "update_aftercare",
        "delete_aftercare"
    ]=Field(description="用户当前消息对应的业务意图")

    reason:str=Field(
        default="",
        max_length=200,
        description="判断该意图的简单理由"
    )
    needs_clarification:bool=Field(
        default=False,
        description="是否需要进一步询问用户"
    )
    clarification_question:str | None=Field(
        default=None,
        description="需要用户补充信息时的问题"
    )