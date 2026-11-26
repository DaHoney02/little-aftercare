#创建模型节点、工具节点、条件路由并编排Graph
from langchain_core.messages import SystemMessage
from langchain_openai import ChatOpenAI
from langgraph.graph import StateGraph,START, END
from langgraph.prebuilt import ToolNode, tools_condition
from sqlalchemy.orm import Session

from app.core.config import settings
from app.graphs.query_state import QueryState
from app.tools.registry import build_query_tools

#系统提示词
QUERY_SYSTEM_PROMPT="""
你是小事后援的业务查询助手

你的职责是帮助当前登录用户查询自己的商品、售后记录和任务

规则：
1.当用户的问题涉及商品、售后记录和任务数据时，优先调用对应的查询工具
2.只能使用提供的查询工具获取业务数据，不允许编造查询结果
3.不允许生成或执行SQL
4.不允许查询其他用户的数据
5.工具没有返回的数据，不得自行推测
6.若查询结果为空，明确告诉用户没有找到符合条件的记录
7.使用简洁、清晰的中文回答
8.若用户的问题缺少必要条件，可以先询问用户
9. 只能查询当前登录用户自己的数据，不能要求用户提供 user_id。
10. 如果用户同时查询多个业务类型，可以连续调用多个查询工具，再整合结果回答。
"""

def build_query_llm():
    """
    创建用于自然语言查询的LangChain模型客户端
    """
    return ChatOpenAI(
        model=settings.MODEL_NAME,
        api_key=settings.DASHSCOPE_API_KEY,
        base_url=settings.DASHSCOPE_BASE_URL,
        temperature=0,
        timeout=30
    )

def build_query_graph(db:Session,user_id:int,llm=None):
    """根据当前请求构建查询工作流"""

    #1.构建当前用户专属的查询工具
    tools=build_query_tools(
        db=db,user_id=user_id
    )
    #2.创建模型，并绑定可用工具
    model=llm or build_query_llm()
    model_with_tools=model.bind_tools(tools)

    #3.定义agent节点
    def agent_node(state:QueryState):
        """模型分析当前对话，决定直接回答或调用工具"""
        messages=[
            SystemMessage(content=QUERY_SYSTEM_PROMPT),
            *state["messages"]
        ]
        response=model_with_tools.invoke(messages)
        return {"messages":[response]}

    #4.创建工作流
    graph_builder=StateGraph(QueryState)

    #5.注册节点
    graph_builder.add_node("agent",agent_node)
    graph_builder.add_node("tools",ToolNode(tools))

    #6.设置入口
    graph_builder.add_edge(START,"agent")

    #7.设置条件路由
    #模型发出工具条用->tools
    #模型直接回答->END
    graph_builder.add_conditional_edges(
        "agent",
        tools_condition,
        {
            "tools":"tools",
            END:END
        }
    )

    #8.工具执行完毕后，回到agent
    #模型根据工具结果生成最终回答
    graph_builder.add_edge("tools","agent")

    #9.编译工作流
    return  graph_builder.compile()