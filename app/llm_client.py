import logging
from typing import Iterator

from openai import OpenAI

from app.core.config import  settings
from app.core.request_context import get_trace_id   #记录模型名称、耗时、输出规模、失败堆栈
from app.exceptions.custom import LLMException
import time

logger=logging.getLogger(__name__)

# 工程思想：配置与代码分离
class LLMClient:
    def __init__(self):
        self.api_key=settings.DASHSCOPE_API_KEY
        self.api_url=settings.DASHSCOPE_BASE_URL
        self.model=settings.MODEL_NAME

        self.client=OpenAI(
            api_key=self.api_key,
            base_url=self.api_url,
            timeout=60.0,
            max_retries=2
        )
    def chat(self,messages)->str:
        """发送消息列表并返回模型回答"""

        # Message转换为SDK所需的字典
        formatted_messages=[
            message.model_dump()
            if hasattr(message,"model_dump")
            else message
            for message in messages
        ]
        trace_id=get_trace_id()
        start_time=time.perf_counter()

        try:
            response=self.client.chat.completions.create(
                model=self.model,
                messages=formatted_messages,
            )
            answer=response.choices[0].message.content

            if not answer or not answer.strip():
                raise LLMException(
                    code=5001,
                    message="模型返回了空回答"
                )
            duration_ms=(time.perf_counter()-start_time) *1000
            logger.info(
                "LLM调用完成 trace_id=%s model=%s input_message_count=%s "
                "output_chars=%s duration_ms=%.2f",
                trace_id,
                self.model,
                len(formatted_messages),
                len(answer),
                duration_ms,
            )

            return answer.strip()
        except LLMException:
            raise
        except Exception as exc:
            duration_ms=(time.perf_counter()-start_time)*1000

            logger.exception(
                "LLM 调用失败 trace_id=%s model=%s duration_ms=%.2f",
                trace_id,
                self.model,
                duration_ms,
            )
            raise LLMException(
                code=5002,
                message="模型服务调用失败，请稍后重试"
            )from exc


    # Iterator[str]---逐步产生字符串的迭代器
    def chat_stream(self,messages)->Iterator[str]:
        """流式调用大模型，逐段返回生成的文本"""
        formatted_messages=[
            message.model_dump()
            if hasattr(message,"model_dump")  #message是否包含model_dump（）
            else message
            for message in messages
        ]

        try:
            # 可以在生成器正常退出或关闭时释放上游反应
            with self.client.chat.completions.create(
                model=self.model,
                messages=formatted_messages,
                stream=True  #流式输出返回结果
            )as response:
                has_content=False

                for chunk in response:  #逐个读取模型返回的数据块
                    if not chunk.choices:
                        continue
                    content=chunk.choices[0].delta.content

                    if content:
                        has_content=True
                        yield content  #yield:每次产生一段文本

                if not has_content:
                    raise LLMException(
                        code=5001,
                        message="模型返回来了空回答"
                    )
        except LLMException:
            raise
        except Exception as exc:
            logger.exception("流式调用LLM失败")
            raise LLMException(
                code=5002,
                message="模型调用失败，请稍后重试"
            )from exc
