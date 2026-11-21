from pathlib import Path

from fastapi import FastAPI,Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.core.lifespan import lifespan
from app.api.api import router as chat_router
from app.core.logger import setup_logger
from app.api.message_api import message_router
from app.api.product_api import router as product_router
from app.exceptions.custom import LLMException
from app.middleware.request_log import request_log_middleware
from app.api.aftercare_api import router as aftercare_router
from app.api.product_cred_api import router as credential_router
from app.api.auth_api import router as auth_router
from app.api.tasks_api import router as task_router
from app.services.aftercare_extractor import AftercareExtractionError

logger=setup_logger()

# 创建fastapi应用对象
app=FastAPI(
    title="AI assistant API",
    description="基于通义千问的ai后端接口",
    version="0.1.0",
    lifespan=lifespan  #生命周期
)

# React/Vite 本地开发服务跨域请求白名单。
app.add_middleware(
    CORSMiddleware,
    # Vite 若默认端口被占用会自动改用 5174 等端口；开发环境允许本机端口。
    allow_origins=[
        "http://127.0.0.1:5174",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://localhost:5173",
    ],
    allow_credentials=True,  #允许浏览器在跨域请求中携带凭证
    allow_methods=["*"],
    allow_headers=["*"],
)
# 项目根目录下的静态资源目录
BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
AVATAR_DIR = STATIC_DIR / "avatars"

# 确保头像目录存在
AVATAR_DIR.mkdir(parents=True, exist_ok=True)

# 挂载静态资源访问路径
app.mount(
    "/static",
    StaticFiles(directory=STATIC_DIR),
    name="static",
)

# 注册路由
app.include_router(chat_router)  #把子路由chat_router挂载到主app
app.include_router(message_router)
app.include_router(aftercare_router)
app.include_router(auth_router)
app.include_router(product_router)
app.include_router(credential_router)
app.include_router(task_router)


@app.get("/")
def home():
    return {"message":"AI API 服务也开启"}

@app.get("/health")
def health():
    return {"status":"ok"}

# 全局异常处理(统一)
@app.exception_handler(LLMException)
async def llm_exception_handler(
        request:Request,
        exc:LLMException):
    return JSONResponse(
        status_code=502,
        content={
            "code":exc.code,
            "message":exc.message,
            "detail":exc.message,
            # request.state--在http请求处理过程中保存临时数据
            "trace_id":getattr(request.state,"trace_id",None),
        },
        headers = {
            "X-Trace-ID": getattr(request.state, "trace_id", ""),
            "X-Request-ID": getattr(request.state, "trace_id", ""),
        },
    )

# RequestValidationError
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
        request:Request,
        exc:RequestValidationError
):
    trace_id=getattr(request.state,"trace_id",None)
    #不直接返回exc.errors(),因其中可含用户提交的原始input
    #只保留前端展示和定位需要的字段
    details=[
        {
            "loc":error.get("loc",[]),
            "msg":error.get("msg","参数不合法"),
            "type":error.get("type","validation_error")
        }
        for error in exc.errors()
    ]

    return JSONResponse(
        status_code=422,
        content={
            "code":4001,
            "message":"请求参数不正确，请检查字段格式",
            "detail":details,
            "trade_id":trace_id
        },
        headers={
            "X-Trace-ID":trace_id or "",
            "X-Request-ID":trace_id or ""
        }
    )

# AftercareExtractionError
@app.exception_handler(AftercareExtractionError)
async def extraction_exception_handler(
    request: Request,
    exc: AftercareExtractionError,
):
    trace_id = getattr(request.state, "trace_id", None)

    return JSONResponse(
        status_code=502,
        content={
            "code": 5101,
            "message": "AI 返回的信息格式不正确，请换一种说法后重试。",
            "detail": str(exc),
            "trace_id": trace_id,
        },
        headers={
            "X-Trace-ID": trace_id or "",
            "X-Request-ID": trace_id or "",
        },
    )

@app.exception_handler(Exception)
async  def global_exception_handler(
        request:Request,
        exc:Exception
):
    """捕获未被其他异常处理器处理的异常"""
    trace_id=getattr(request.state,"trace_id",None)
    logger.exception(
        "请求发送未处理异常，method=%s path=%s trace_id=%s",
        request.method,
        request.url.path,
        trace_id
    )
    return JSONResponse(
        status_code=500,
        content={
            "code":500,
            "message":"服务器内部错误",
            "detail":"请求处理失败，请稍后重试",
            "trace_id":trace_id
        },
        headers={
            "X-Trace-ID": trace_id or "",
            "X-Request-ID": trace_id or "",
        }
    )

# 注册Middleware
app.middleware("http")(request_log_middleware)  # 所有接口自动记录
