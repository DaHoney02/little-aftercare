

"""
请求上下文
ContextVar:python内置函数，解决每个异步请求不串线
"""
from contextvars import ContextVar, Token

trace_id_var:ContextVar[str | None]=ContextVar(
    "trace_id",
    default=None
)

def get_trace_id()->str | None:
    """读取当前请求的最终ID。没有HTTP请求返回None"""
    return trace_id_var.get()

def set_trace_id(trace_id:str)->Token:
    """将追踪ID写入当前异步请求上下文，并返回恢复凭证"""
    return trace_id_var.set(trace_id)

def reset_trace_id(token:Token)->None:
    """请求结束后恢复上下文，避免并发请求之间污染"""
    trace_id_var.reset(token)