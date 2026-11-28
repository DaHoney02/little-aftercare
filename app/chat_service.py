import logging
import re
from typing import Iterator

from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from sqlalchemy.orm import Session

from app.db.aftercare.aftercare_respository import (
    create_record,
    list_records,
    get_record,
    update_record,
    delete_record
)
from app.db.messages.message_repository import (
    list_chat_messages,
    create_messages
)
from app.db.aftercare.pending_aftercare_repository import (
    get_pending,
    delete_pending,
    save_pending
)
from app.graphs.query_graph import build_query_graph
from app.llm_client import LLMClient
from app.schemas.aftercare import AftercareCreate, AftercareUpdate
from app.schemas.schemas import Message
from app.seession_store import session_store
from app.services.after_update_extractor import AftercareUpdateExtractor
from app.services.aftercare_extractor import AftercareExtractor
from app.services.intent_classifier import IntentClassifier

logger=logging.getLogger(__name__)

class ChatService:
    """负责聊天流程与售后业务流程的协调"""

    def __init__(self,db:Session | None=None):
        # 模型客户端：调用LLM服务
        self.llm_client=LLMClient()
        self.db=db #db=None时，普通聊天可以使用内存历史记录

        # 两个业务组件复用一个模型客户端
        self.intent_classifier=IntentClassifier(self.llm_client)
        self.aftercare_extractor=AftercareExtractor(self.llm_client)
        self.aftercare_update_extractor = AftercareUpdateExtractor(
            llm_client=self.llm_client
        )

    # 普通聊天
    def chat(
            self,
            messages:list[Message],
            user_id:int,
            session_id:str|None=None
    )->str:
        """
        接收用户问题，调用LLM,并返回回答

        执行顺序：
        1.校验输入
        2.读取历史消息并组合上下文
        3.取出最后一条用户消息
        4.优先尝试处理售后业务
        5.若不是售后业务，调用普通聊天模型
        6.校验回答并保存本轮对话
        """

        # 1.输入校验
        if not messages:
            raise ValueError("聊天消息列表不能为空")

        # 2.读取历史消息
        if session_id:
            if self.db is not None:
                # 有session_id时，优先PostgreSQL 历史记录
                history=list_chat_messages(
                    db=self.db,
                    session_id=session_id,
                    user_id=user_id
                )
            else:
                # 保留内存存储行为
                history=session_store.get_messages(session_id)
            # 将历史消息与本轮消息合并，再历史裁剪
            full_messages=session_store.trim_messages(
                history+messages
            )  #拼接
        else:
            # 没有session_id时，不读取或保存
            full_messages=messages

        # 3.提取最后一条用户消息
        user_messages=[
            message
            for message in messages
            if message.role=="user"
        ]
        if not user_messages:
            raise ValueError("聊天请求中缺少用户消息")

        user_text=user_messages[-1].content

        # 4.优先尝试处理售后业务
        answer = self._handle_aftercare_intent(
            user_text=user_text,
            user_id=user_id,
            session_id=session_id,
            messages=full_messages
        )
        # None 表示这不是已处理的售后业务，继续走普通聊天。
        if answer is None:
            answer = self.llm_client.chat(full_messages)

        # 5.统一校验最终回答
        if not answer or not answer.strip():
            logger.warning("模版返回了空回答")
            raise RuntimeError("模型未返回有效回答" )

        answer=answer.strip()

        # 6.保存本轮对话
        if session_id:
            # 将本轮用户消息与ai回答合并成一个列表
            turn_messages = messages + [
                Message(
                    role="assistant",
                    content=answer
                )
            ]
            if self.db is not None:
                # 一次调用批量保存，统一提交事务
                create_messages(
                    db=self.db,
                    session_id=session_id,
                    user_id=user_id,
                    messages=turn_messages
                )
            else:
                # 内存模式：
                session_store.save_messages(
                    session_id,
                    full_messages+[
                        Message(
                            role="assistant",
                            content=answer
                        )
                    ],
                )
        return answer

    def chat_stream(
            self,
            messages: list[Message],
            user_id: int,
            session_id: str | None = None,
    ) -> Iterator[str]:
        """
        流式聊天。

        处理顺序：
        1. 读取历史消息并组合上下文。
        2. 提取当前用户消息。
        3. 优先处理售后业务和 LangGraph 自然语言查询。
        4. 如果不是业务请求，再调用普通模型流式生成。
        5. 正常完成后保存本轮对话。

        注意：
        LangGraph 查询当前采用同步 invoke，
        因此业务查询结果会作为一个完整文本块返回；
        普通聊天仍然保持逐块流式输出。
        """

        # 1. 输入校验
        if not messages:
            raise ValueError("聊天消息列表不能为空")

        # 2. 读取历史消息
        if session_id:
            if self.db is not None:
                history = list_chat_messages(
                    db=self.db,
                    session_id=session_id,
                    user_id=user_id,
                )
            else:
                history = session_store.get_messages(
                    session_id,
                    user_id,
                )

            full_messages = session_store.trim_messages(
                history + messages
            )
        else:
            full_messages = messages

        # 3. 提取当前请求中的最后一条用户消息
        user_messages = [
            message
            for message in messages
            if message.role == "user"
        ]

        if not user_messages:
            raise ValueError("聊天请求中缺少用户消息")

        user_text = user_messages[-1].content

        logger.info(
            "开始处理流式聊天：user_id=%s, session_id=%s",
            user_id,
            session_id,
        )

        # 4. 优先处理业务意图
        # 复用 chat() 中已经实现的售后业务和 LangGraph 查询分流。
        business_answer = self._handle_aftercare_intent(
            user_text=user_text,
            user_id=user_id,
            session_id=session_id,
            messages=full_messages,
        )

        # 5. 如果是业务请求，直接返回业务处理结果
        if business_answer is not None:
            answer = business_answer.strip()

            if not answer:
                raise RuntimeError("业务处理未返回有效回答")
            # 当前 LangGraph 使用 invoke，因此这里一次性返回完整结果。
            yield answer

            # 保存本轮对话
            if session_id:
                turn_messages = messages + [
                    Message(
                        role="assistant",
                        content=answer,
                    )
                ]

                if self.db is not None:
                    create_messages(
                        db=self.db,
                        session_id=session_id,
                        user_id=user_id,
                        messages=turn_messages,
                    )
                else:
                    session_store.save_messages(
                        session_id,
                        full_messages + [
                            Message(
                                role="assistant",
                                content=answer,
                            )
                        ],
                    )
            return

        # 6. 普通聊天：继续使用原有模型流式生成
        answer_parts: list[str] = []
        stream = self.llm_client.chat_stream(full_messages)
        completed = False

        try:
            for chunk in stream:
                if chunk:
                    answer_parts.append(chunk)
                    yield chunk

            completed = True
        finally:
            # 无论正常结束、异常还是外部关闭，都尝试关闭底层生成器。
            close = getattr(stream, "close", None)
            if callable(close):
                close()

        # 7. 只有正常完成才保存聊天记录
        if completed and session_id:
            answer = "".join(answer_parts).strip()

            if answer:
                turn_messages = messages + [
                    Message(
                        role="assistant",
                        content=answer,
                    )
                ]
                if self.db is not None:
                    create_messages(
                        db=self.db,
                        session_id=session_id,
                        user_id=user_id,
                        messages=turn_messages,
                    )
                else:
                    session_store.save_messages(
                        session_id,
                        full_messages + [
                            Message(
                                role="assistant",
                                content=answer,
                            )
                        ],
                    )

    # 二、售后意图分流与候选记录处理
    def _handle_aftercare_intent(
            self,
            user_text: str,
            user_id:int,
            session_id: str | None,
            messages:list[Message]
    ) -> str | None:
        """
        处理售后业务意图。

        处理顺序：
        1. 优先检查当前会话是否存在待确认操作。
        2. 如果存在，处理确认或取消。
        3. 如果不存在，识别用户当前意图。
        4. 根据意图分发到对应业务方法。

        返回：
        - str：售后业务已经处理，直接返回业务结果。
        - None：普通聊天，交由 chat() 调用 LLM。
        """

        # ==================================================
        # 一、优先处理当前会话已有的待确认操作
        # ==================================================

        if session_id and self.db is not None:
            pending = get_pending(
                db=self.db,
                user_id=user_id,
                session_id=session_id)

            if pending is not None:
                normalized = "".join(user_text.split())
                candidate = pending.candidate or {}

                # 读取操作类型。
                # 兼容旧数据：没有 action 时，默认视为新增操作。
                action = candidate.get("action", "create")

                # ---------- 1. 用户取消操作 ----------
                cancel_commands = {
                    "取消",
                    "取消保存",
                    "取消删除",
                    "不保存",
                    "算了",
                }

                if normalized in cancel_commands:
                    try:
                        delete_pending(
                            db=self.db,
                            user_id=user_id,
                            session_id=session_id)
                        self.db.commit()

                        return "已取消当前待确认操作，正式售后记录未发生变化。"

                    except Exception:
                        self.db.rollback()
                        logger.exception("取消待确认操作失败")
                        raise

                # ---------- 2. 用户确认操作 ----------
                create_confirm_commands = {
                    "确认",
                    "确认保存",
                    "保存",
                    "确认添加",
                }

                delete_confirm_commands = {
                    "确认删除",
                    "确定删除",
                }

                if action == "create":
                    if normalized not in create_confirm_commands:
                        return (
                            "当前有一条待确认的新增记录。\n"
                            "请回复“确认保存”或“取消”。"
                        )

                    try:
                        # 读取新增记录的业务数据。
                        data = candidate.get("data", {})

                        # 使用 Pydantic 再次校验正式入库数据。
                        record_data = AftercareCreate(**data)

                        # 创建正式售后记录。
                        created_record = create_record(
                            db=self.db,
                            data=record_data,
                            session_id=session_id,
                            user_id=user_id
                        )

                        # 清除待确认记录。
                        delete_pending(db=self.db,user_id=user_id, session_id=session_id)

                        # 新增正式记录和清理 pending 一起提交。
                        self.db.commit()

                        return (
                            f"已确认并保存售后记录："
                            f"{created_record.title}"
                        )

                    except Exception:
                        self.db.rollback()
                        logger.exception("确认新增售后记录失败")
                        raise

                elif action == "delete":
                    if normalized not in delete_confirm_commands:
                        return (
                            "当前有一条待确认的删除操作。\n"
                            "请明确回复“确认删除”或“取消”。"
                        )

                    try:
                        # 读取待删除记录 ID。
                        record_id = candidate.get("record_id")

                        if record_id is None:
                            return (
                                "待删除记录信息不完整，"
                                "请重新发起删除请求。"
                            )

                        # 再次查询，防止记录在等待确认期间已被删除。
                        # 同时验证记录属于当前 session_id。
                        record = get_record(
                            db=self.db,
                            record_id=record_id,
                            user_id=user_id,
                        )

                        if record is None:
                            delete_pending(
                                db=self.db,user_id= user_id,session_id=session_id)
                            self.db.commit()

                            return (
                                "该记录不存在或已被删除，"
                                "本次待删除操作已取消。"
                            )

                        title = record.title

                        # 删除正式记录。
                        delete_record(db=self.db, user_id=user_id,record_id=record_id)

                        # 同时删除待确认记录。
                        delete_pending(
                            db=self.db, user_id=user_id,session_id=session_id)

                        # 两项操作统一提交。
                        self.db.commit()

                        return (
                            f"已确认删除售后记录：{title}\n"
                            f"记录 ID：{record_id}"
                        )

                    except Exception:
                        self.db.rollback()
                        logger.exception("确认删除售后记录失败")
                        raise

                else:
                    logger.error("未知的待确认操作类型：%s", action)
                    return "无法识别当前待确认操作，请重新发起请求。"

        # 普通消息直接交给聊天模型，不额外调用意图分类模型。
        if not self._may_be_business_operation(user_text):
            return None

        # ==================================================
        # 二、没有待确认操作，识别用户当前意图
        # ==================================================

        intent_result = self.intent_classifier.classify(user_text)
        intent = intent_result.intent

        logger.info(
            "售后意图识别：user_text=%r, intent=%r, "
            "reason=%r, needs_clarification=%s",
            user_text,
            intent,
            intent_result.reason,
            intent_result.needs_clarification,
        )

        # 如果模型判断需要补充信息，先向用户提问。
        # 此时不执行新增、修改或删除操作。
        if intent_result.needs_clarification:
            return (
                    intent_result.clarification_question
                    or "请补充必要信息，以便继续处理。"
            )

        # 普通聊天交给 chat()，继续调用原有 LLM。
        if intent == "chat":
            return None

        # ==================================================
        # 三、校验售后业务运行条件
        # ==================================================

        if not session_id:
            return "请先提供会话 ID，再进行售后记录操作。"

        if self.db is None:
            return "数据库暂不可用，无法处理售后记录，请稍后重试。"

        # ==================================================
        # 四、根据意图分发业务
        # ==================================================

        if intent == "create_aftercare":
            return self._create_pending_aftercare(
                user_text=user_text,
                user_id=user_id,
                session_id=session_id,
            )

        if intent in { "query_aftercare","query_business"}:
           return self._query_business(
               messages=messages,
               user_id=user_id,
               thread_id=session_id
            )

        if intent == "update_aftercare":
            return self._update_aftercare(
                user_text=user_text,
                user_id=user_id,
                session_id=session_id,
            )

        if intent == "delete_aftercare":
            return self._delete_aftercare(
                user_text=user_text,
                user_id=user_id,
                session_id=session_id,
            )

        logger.warning("收到暂不支持的售后意图：%s", intent)
        return "暂时无法处理这个业务请求，请换一种方式描述。"

    def _create_pending_aftercare(
            self,
            user_text: str,
            user_id:int,
            session_id: str,
    ) -> str:
        """
        从用户描述中提取售后信息，并保存为待确认候选记录。

        注意：
        此方法只创建待确认数据，不创建正式售后记录。
        用户确认后，才会真正写入 AftercareRecord。
        """

        # 1. 调用提取器，将自然语言转换成结构化数据。
        extraction = self.aftercare_extractor.extract(user_text)

        # 2. 将 Pydantic 对象转换为字典。
        extracted = extraction.model_dump(mode="json")

        # 3. 分离提取过程的辅助信息。
        missing_fields = extracted.pop("missing_fields", [])
        needs_confirmation = extracted.pop("needs_confirmation", True)

        # 4. 只保留正式售后记录允许的字段。
        allowed_fields = set(AftercareCreate.model_fields)

        data = {
            key: value
            for key, value in extracted.items()
            if key in allowed_fields
        }

        # 5. 检查必填字段。
        if not data.get("title"):
            return "我还没识别出商品名称，请补充商品名称后再试。"

        # 6. 构造待确认数据。
        candidate = {
            "action": "create",
            "data": data,
            "missing_fields": missing_fields,
            "needs_confirmation": needs_confirmation,
        }

        # 7. 保存待确认操作。
        # Repository 只执行 flush，不提交事务。
        try:
            save_pending(
                db=self.db,
                user_id=user_id,
                session_id=session_id,
                candidate=candidate,
            )

            # 由 Service 统一提交。
            self.db.commit()

        except Exception:
            self.db.rollback()
            logger.exception("保存待确认售后记录失败")
            raise

        # 8. 整理用户可读的确认摘要。
        lines = [
            "我整理了一条待确认的售后记录：",
            f"商品：{data.get('title')}",
            f"平台：{data.get('platform') or '未填写'}",
            f"购买日期：{data.get('purchase_date') or '未填写'}",
            f"退货截止日期：{data.get('return_deadline') or '未填写'}",
            f"保修截止日期：{data.get('warranty_deadline') or '未填写'}",
            f"备注：{data.get('notes') or '无'}",
        ]

        if missing_fields:
            lines.append(
                "还需要补充的信息：" + "、".join(missing_fields)
            )

        lines.append("请核对信息后回复“确认保存”或“取消”。")

        return "\n".join(lines)

    @staticmethod
    def _extract_record_id(user_text: str) -> int | None:
        """
        从用户输入中提取明确指定的售后记录 ID。

        支持示例：
        - 删除记录 ID 为 12
        - 修改记录编号：8
        - 删除 ID: 15

        如果没有识别到数字 ID，则返回 None。
        """

        pattern = (
            r"(?:记录\s*(?:ID|编号)?|ID|编号)"
            r"\s*[：:#为是]?\s*(\d+)"
        )

        match = re.search(
            pattern,
            user_text,
            re.IGNORECASE,
        )

        if match is None:
            return None

        return int(match.group(1))

    def _update_aftercare(
            self,
            user_id: int,
            session_id: str,
            user_text: str,
    ) -> str:
        """根据用户要求，提取并更新当前用户指定的售后记录。"""

        if self.db is None:
            return "数据库暂不可用，暂时无法修改记录。"

        db = self.db

        # 1. 从用户描述中提取记录 ID。
        record_id = self._extract_record_id(user_text)

        if record_id is None:
            return "请提供需要修改的记录 ID，例如：修改记录 ID 为 12 的保修日期。"

        try:
            # 2. 调用 AI 提取用户明确要求修改的字段。
            extracted = self.aftercare_update_extractor.extract(user_text)

            # 3. 只保留模型实际返回且值非空的字段。
            update_data = extracted.model_dump(
                exclude_unset=True,
                mode="python",
            )

            update_data = {
                key: value
                for key, value in update_data.items()
                if value is not None
            }

            # 4. 没有识别出有效修改内容，不操作数据库。
            if not update_data:
                return (
                    "没有识别到明确的修改内容。"
                    "请告诉我具体要修改哪个字段，以及修改后的内容。"
                )

            # 5. 使用 Pydantic Schema 再次校验更新数据。
            update_schema = AftercareUpdate.model_validate(update_data)

            # 6. Repository 根据 record_id + user_id 查询并更新。
            # 不属于当前用户的记录也会返回 None。
            updated_record = update_record(
                db=db,
                record_id=record_id,
                user_id=user_id,
                data=update_schema,
            )

            if updated_record is None:
                return f"没有找到 ID 为 {record_id} 的后援记录。"

            # 7. 提交事务并刷新对象。
            db.commit()
            db.refresh(updated_record)

            logger.info(
                "后援记录修改成功：user_id=%s, record_id=%s, fields=%s",
                user_id,
                record_id,
                list(update_data.keys()),
            )

            return (
                f"记录修改成功！\n"
                f"记录 ID：{updated_record.id}\n"
                f"事项名称：{updated_record.title}"
            )

        except Exception:
            db.rollback()

            logger.exception(
                "后援记录修改失败：user_id=%s, session_id=%s, record_id=%s",
                user_id,
                session_id,
                record_id,
            )
            raise

    def _delete_aftercare(
            self,
            user_text: str,
            user_id:int,
            session_id: str,
    ) -> str:
        """
        发起售后记录删除请求。

        当前阶段只负责：
        1. 提取记录 ID。
        2. 验证记录是否存在以及是否属于当前会话。
        3. 保存待删除操作。
        4. 提示用户确认。

        注意：
        此方法不直接删除正式售后记录。
        真正的删除操作由确认分支执行。
        """

        # 1. 提取用户明确指定的记录 ID。
        record_id = self._extract_record_id(user_text)

        if record_id is None:
            return (
                "请提供需要删除的售后记录 ID，"
                "例如：删除记录 ID 为 12。"
            )

        # 2. 检查记录是否存在，并验证会话归属。
        record = get_record(
            db=self.db,
            record_id=record_id,
            user_id=user_id,
        )

        if record is None:
            return f"当前会话下没有找到 ID 为 {record_id} 的售后记录。"

        # 3. 构造待确认删除数据。
        candidate = {
            "action": "delete",
            "record_id": record.id,
            "title": record.title,
        }

        # 4. 保存待确认操作，由 Service 负责事务提交。
        try:
            save_pending(
                db=self.db,
                user_id=user_id,
                session_id=session_id,
                candidate=candidate,
            )

            self.db.commit()

        except Exception:
            self.db.rollback()
            logger.exception(
                "保存待删除操作失败，record_id=%s",
                record_id,
            )
            raise

        # 5. 返回删除确认信息。
        return (
            f"即将删除以下售后记录：\n"
            f"商品：{record.title or '未填写'}\n"
            f"记录 ID：{record.id}\n"
            "请回复“确认删除”执行删除，或回复“取消”放弃操作。"
        )

    @staticmethod
    def _may_be_business_operation(text: str) -> bool:
        """
        粗略判断消息是否可能包含业务操作。

        这里只负责减少不必要的意图分类调用，
        不负责最终确定用户意图。
        """
        keywords = (
            #售后记录
            "记录", "保存","新增","添加","查询",
            "查看","列出","修改","更改","更新",
            "删除","移除","退货","保修","售后",

            #商品档案
            "商品", "产品", "品牌", "型号",
            "购买", "购物", "分类",

            # 任务
            "任务", "待办", "事项", "提醒",
            "已完成", "未完成", "优先级",
        )

        return any(keyword in text for keyword in keywords)

    def _query_business(
            self,
            messages: list[Message],
            user_id: int,
            thread_id: str,
    ) -> str:
        """通过 LangGraph 查询当前登录用户的业务数据。
        未使用checkpointer历史持久化，因有会话里会话管理机制
        """

        if self.db is None:
            raise RuntimeError("数据库连接不可用")

        if not thread_id:
            raise ValueError("会话 ID 不能为空")

        graph_messages = []

        # 将项目消息模型转换为 LangChain 消息对象
        for msg in messages:
            match msg.role:
                case "user":
                    graph_messages.append(
                        HumanMessage(content=msg.content)
                    )
                case "assistant":
                    graph_messages.append(
                        AIMessage(content=msg.content)
                    )
                case "system":
                    graph_messages.append(
                        SystemMessage(content=msg.content)
                    )
                case _:
                    raise ValueError(f"不支持的角色: {msg.role}")

        if not graph_messages:
            raise ValueError("查询消息不能为空")

        # 按当前用户构建专属查询工具，避免跨用户共享身份上下文
        graph = build_query_graph(
            db=self.db,
            user_id=user_id,
        )

        result = graph.invoke(
            {"messages": graph_messages},
            config={
                "configurable": {
                    "thread_id": thread_id,
                },
                "recursion_limit":10,  #限制节点执行步数
            },
        )

        # 从后向前寻找最后一条有效的 AI 文本消息
        for msg in reversed(result["messages"]):
            if isinstance(msg, AIMessage):
                text = msg.content

                if isinstance(text, str) and text.strip():
                    return text.strip()

        raise RuntimeError("业务查询未生成有效回答")