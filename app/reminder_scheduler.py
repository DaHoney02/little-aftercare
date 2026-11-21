import logging
from zoneinfo import ZoneInfo

from apscheduler.schedulers.blocking import BlockingScheduler

from app.services.reminder_job import generate_daily_reminders

logging.basicConfig(level=logging.INFO)  #配置根日志器：输出控制台
logger=logging.getLogger(__name__)

def run_reminder_job()->None:
    """售后提醒定时调度器：

    BlockingScheduler：APScheduler阻塞式调度器（主线程一致阻塞等待任务）
    每天9点自动执行一次，扫描数据并生成提醒
    同时记录日志、捕获异常

    运行一次提醒扫描，并记录结果"""
    try:
        count=generate_daily_reminders()  #自定义扫描函数
        logger.info("被提醒扫描完成，本次新增 %s 条提醒",count)
    except Exception:
        logger.exception("提醒扫描失败")

# BlockingScheduler:一致运行并等待任务时间（APScheduler 3.x）
scheduler=BlockingScheduler(
    timezone=ZoneInfo("Asia/Shanghai")  #指定调度器时区，cron时间以此为准
)
# 注册任务
scheduler.add_job(
    run_reminder_job,  #需执行的函数
    trigger="cron",  #触发器类型 interval(固定间隔)、date（某个时间点执行一次）
    hour=9,  #执行时间
    minute=0,
    id="generate_daily_aftercare_reminders",  #任务唯一标识
    replace_existing=True,  #避免同时注册同一个任务
    max_instances=1,  #避免同一个任务重叠执行
    coalesce=True  #若错过多次触发，只执行一次
)

if __name__=="__main__":
    logger.info("售后提醒调度器已启动，每天自动扫描数据变更")
    scheduler.start()  #启动