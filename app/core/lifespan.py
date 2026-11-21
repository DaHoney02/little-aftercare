
"""应用生命周期：初始化资源、启动定时任务、关闭时释放资源。"""

import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI
from apscheduler.schedulers.background import BackgroundScheduler

from app.db.database import get_db
from app.services.task_service import TaskService

logger = logging.getLogger(__name__)

def run_deadline_task_scan() -> None:
    """
    扫描即将到期的售后记录，生成系统任务。

    独立管理本次扫描的数据库 Session 和事务。
    """
    db_generator = get_db()
    db = next(db_generator)

    try:
        service = TaskService(db)

        created_count = service.generate_deadline_tasks(days=7)

        db.commit()

        logger.info(
            "售后期限任务扫描完成，本次新增 %s 条任务",
            created_count,
        )

    except Exception:
        db.rollback()
        logger.exception("售后期限任务扫描失败")

    finally:
        db_generator.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """启动应用时注册并启动调度器，关闭时停止调度器。"""
    logger.info("服务启动")
    scheduler = BackgroundScheduler(timezone="UTC")

    # 每 6 小时扫描一次；服务启动后立即执行首次扫描。
    scheduler.add_job(
        run_deadline_task_scan,
        trigger="interval",
        hours=6,
        id="aftercare_deadline_task_scan",
        name="售后期限自动任务扫描",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
        next_run_time=datetime.now(timezone.utc),
    )

    scheduler.start()

    app.state.scheduler = scheduler

    try:
        yield

    finally:
        if scheduler.running:
            scheduler.shutdown(wait=False)

        logger.info("服务关闭，定时任务调度器已停止")
