from datetime import datetime, timezone, time, timedelta, date
from math import ceil

from fastapi import HTTPException,status

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Product, AftercareRecord, Task
from app.db.tasks.task_repository import TaskRepository
from app.db.tasks.task_notification_repository import TaskNotificationRepository
from app.schemas.task import TaskCreate, TaskUpdate

class TaskService:
    def __init__(self,db:Session):
        self.db=db
        self.repository=TaskRepository(db)
        # 保证任务更新和通知失效处于同一事务
        self.notification_repository=TaskNotificationRepository(db)

    def _validate_relations(
            self,
            user_id:int,
            product_id:int|None,
            aftercare_id:int|None
    )->None:
        """校验商品与售后记录是否属于当前用户"""
        product=None
        aftercare=None
        if product_id is not None:
            product=self.db.scalar(
                select(Product).where(
                    Product.id==product_id,
                    Product.user_id==user_id
                )
            )
            if product is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="关联商品不存在"
                )
        if aftercare_id is not None:
            aftercare=self.db.scalar(
                select(AftercareRecord).where(
                    AftercareRecord.id==aftercare_id,
                    AftercareRecord.user_id==user_id
                )
            )
            if aftercare is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="关联售后记录不存在"
                )

        #同时关联撒花姑娘品和售后记录时，必须属于同一个商品
        if(
            product is not None
            and aftercare is not None
            and aftercare.product_id != product.id
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="关联商品与售后记录不匹配"
            )

    @staticmethod
    def _validate_time(
            scheduled_at:datetime|None,
            reminder_at:datetime|None
    )->None:
        """校验提醒时间不能晚于计划执行时间"""
        if scheduled_at is None or reminder_at is None:
            return

        #不允许混用有时区和无时区的时间
        if (
            (scheduled_at.tzinfo is None)
            != (reminder_at.tzinfo is None)
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="计划时间和提醒时间必须使用一致的时区格式"
            )
        if reminder_at>scheduled_at:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="提醒时间不能晚于计划时间"
            )

    def create_task(self,user_id:int,task_data:TaskCreate)->Task:
        """创建用户手动任务"""
        data=task_data.model_dump()

        self._validate_relations(
            user_id=user_id,
            product_id=data.get("product_id"),
            aftercare_id=data.get("aftercare_id")
        )
        self._validate_time(
            data.get("scheduled_at"),
            data.get("reminder_at"),
        )

        data.update({
            "user_id": user_id,
            "source_type": "manual",
            "source_key": None,
            "status": "pending",
        })
        return self.repository.create(data)

    def list_tasks(
            self,
            user_id: int,
            page: int = 1,
            page_size: int = 10,
            status: str | None = None,
            priority: str | None = None,
            keyword: str | None = None,
            source_type: str | None = None,
            source_key: str | None = None
    ) -> dict:
        """分页查询任务。"""

        items, total = self.repository.list_tasks(
            user_id=user_id,
            page=page,
            page_size=page_size,
            status=status,
            priority=priority,
            keyword=keyword,
            source_type=source_type,
            source_key=source_key
        )

        return {
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": ceil(total / page_size) if total else 0,
        }

    def get_task(self, task_id: int, user_id: int) -> Task:
        """查询任务详情。"""

        task = self.repository.get_by_id(task_id, user_id)

        if task is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="任务不存在",
            )

        return task

    def update_task(
            self,
            task_id: int,
            user_id: int,
            task_data: TaskUpdate,
    ) -> Task:
        """局部更新任务。"""

        task = self.get_task(task_id, user_id)

        # 只获取本次请求明确提交的字段。
        update_data = task_data.model_dump(exclude_unset=True)

        if not update_data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="没有提交需要更新的字段",
            )

        # title 不允许显式传 null。
        if "title" in update_data and update_data["title"] is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="任务标题不能为空",
            )

        # 合并数据库原值和本次提交值，再校验最终关联关系。
        product_id = update_data.get("product_id", task.product_id)
        aftercare_id = update_data.get("aftercare_id", task.aftercare_id)

        self._validate_relations(
            user_id=user_id,
            product_id=product_id,
            aftercare_id=aftercare_id,
        )

        scheduled_at = update_data.get(
            "scheduled_at",
            task.scheduled_at,
        )
        reminder_at = update_data.get(
            "reminder_at",
            task.reminder_at,
        )

        self._validate_time(scheduled_at, reminder_at)

        # 完成任务时记录完成时间；重新打开或取消时清空。
        new_status = update_data.get("status")
        if new_status == "completed" and task.status != "completed":
            update_data["completed_at"] = datetime.now(timezone.utc)
        elif new_status in {"pending", "in_progress", "cancelled"}:
            update_data["completed_at"] = None

        old_reminder_at = task.reminder_at
        updated_task = self.repository.update(task, update_data)
        reminder_changed = (
                "reminder_at" in update_data
                and old_reminder_at != updated_task.reminder_at
        )
        task_no_longer_active = updated_task.status in {
            "completed",
            "cancelled",
        }

        if reminder_changed or task_no_longer_active:
            self.notification_repository.dismiss_unread_by_task(
                task_id=updated_task.id
            )

        return updated_task

    def delete_task(self, task_id: int, user_id: int) -> None:
        """删除当前用户的任务。"""
        task = self.get_task(task_id, user_id)
        self.repository.delete(task)

    def get_task_stats(self,user_id:int)->dict:
        """获取当前用户的全量任务统计"""
        return self.repository.get_task_stats(user_id)

    @staticmethod
    def _get_deadline_config(record:AftercareRecord)->dict:
        """
        获取一天售后记录中需要管理的期限配置
        """
        return {
            "return_deadline":{
                "deadline":record.return_deadline,
                "title":"退货期限即将到期"
            },
            "warranty_deadline":{
                "deadline":record.warranty_deadline,
                "title":"保修期限即将到期"
            }
        }

    def sync_aftercare_deadline_tasks(
            self,
            record:AftercareRecord
    )->int:
        """
        根据一条售后记录，同步其对应的系统任务

        1. 售后记录未完成且期限存在：创建或更新系统任务。
        2. 期限被清空：取消对应的未完成系统任务。
        3. 售后记录已完成：取消该记录关联的未完成系统任务。
        4. 已完成任务不自动重开。
        5. source_key 保证同一售后期限只有一条系统任务。

        返回本次创建或更新的任务数量。
        不提交事务，由调用方统一 commit / rollback。
        """
        configs=self._get_deadline_config(record)
        changed_count=0
        for source_suffix,config in configs.items():
            source_key=f"aftercare:{record.id}:{source_suffix}"
            deadline=config["deadline"]

            existing_task = self.repository.get_by_source_key(
                source_key=source_key,
                user_id=record.user_id,
            )

            #售后完成，或对应期限已清空
            #只取消尚未完成的任务
            if record.status=="completed" or deadline is None:
                if (
                    existing_task is not None
                    and existing_task.status in {"pending","in_progress"}
                ):
                    self.repository.update(
                        existing_task,
                        {
                            "status":"cancelled",
                            "completed_at":None
                        }
                    )
                    changed_count += 1
                continue

            scheduled_at=datetime.combine(
                deadline,
                time.min,
                tzinfo=timezone.utc,
            )
            days_remaining=(deadline-date.today()).days
            priority="high" if days_remaining <= 3 else "medium"
            task_data={
                "user_id":record.user_id,
                "product_id":record.product_id,
                "aftercare_id":record.id,
                "title":config["title"],
                "description":(
                    f"关联售后记录：{record.title or '未命名售后记录'}。"
                    f"请在{deadline.isoformat()}前处理相关事项"
                ),
                "source_type":"system",
                "source_key":source_key,
                "status":"pending",
                "priority":priority,
                "scheduled_at":scheduled_at,
                "reminder_at":None
            }

            #已存在任务：更新任务信息
            if existing_task is not None:
                # 已完成的任务不因修改期限而被重新打开
                if existing_task.status=="completed":
                    continue

                # 已取消任务如果对应期限没有变化，就保留取消状态。
                # 只有期限发生变化时，才重新激活这条系统任务。
                if (
                    existing_task.status=="cancelled"
                    and existing_task.scheduled_at==scheduled_at
                ):
                    continue

                self.repository.update(
                    existing_task,
                    {
                        **task_data,
                        # 若原任务已取消，而期限被重新设置，则重新激活同一条系统任务
                        "status":"pending",
                        "completed_at":None
                    }
                )
                changed_count += 1
                continue

            #不存在任务：创建新的系统任务
            created=self.repository.create_system_task_if_absent(task_data)
            if created:
                changed_count += 1

        return  changed_count

    def generate_deadline_tasks(self, days: int = 7) -> int:
        """
        扫描即将到期的售后记录，生成系统任务。

        规则：
        1. 扫描今天到未来 days 天内的期限。
        2. 已完成的售后记录不生成任务。
        3. 退货期限和保修期限分别生成独立任务。
        4. source_key 保证同一事件只生成一次。
        5. 不提交事务，由调用方负责 commit / rollback。

        返回本次实际创建的任务数量。
        """
        if days < 0:
            raise ValueError("days 不能小于 0")
        today = datetime.now(timezone.utc).date()
        end_date = today + timedelta(days=days)

        records = self.db.scalars(
            select(AftercareRecord).where(
                AftercareRecord.status != "completed",
            )
        ).all()

        created_count = 0
        for record in records:
            deadline_items = [
                (
                    "return_deadline",
                    record.return_deadline,
                    "退货期限即将到期",
                ),
                (
                    "warranty_deadline",
                    record.warranty_deadline,
                    "保修期限即将到期",
                ),
            ]

            for deadline_type, deadline, title in deadline_items:
                if deadline is None:
                    continue
                # 只处理今天到未来 days 天内的期限。
                if not today <= deadline <= end_date:
                    continue
                source_key = (
                    f"aftercare:{record.id}:{deadline_type}"
                )
                scheduled_at = datetime.combine(
                    deadline,
                    time.min,
                    tzinfo=timezone.utc,
                )

                task_data = {
                    "user_id": record.user_id,
                    "product_id": record.product_id,
                    "aftercare_id": record.id,
                    "title": title,
                    "description": (
                        f"关联售后记录：{record.title or '未命名售后记录'}。"
                        f"请在 {deadline.isoformat()} 前处理相关事项。"
                    ),
                    "source_type": "system",
                    "source_key": source_key,
                    "status": "pending",
                    "priority": "medium",
                    "scheduled_at": scheduled_at,
                    "reminder_at": None,
                }
                created = self.repository.create_system_task_if_absent(
                    task_data
                )
                if created:
                    created_count += 1
        return created_count

    def create_task_from_deadline(
            self,
            user_id:int,
            record_id:int,
            deadline_type:str
    )->Task:
        """根据指定售后期限获取对应系统任务"""

        # 查询当前用户的售后记录，防止跨用户访问
        record=self.db.scalar(
            select(AftercareRecord).where(
                AftercareRecord.id==record_id,
                AftercareRecord.user_id==user_id
            )
        )
        if record is None:
            raise ValueError("售后记录不存在")

        deadline_map={
            "return":record.return_deadline,
            "warranty":record.warranty_deadline,
        }

        if deadline_type not in deadline_map:
            raise ValueError("不支持的售后期限类型")

        if deadline_map[deadline_type] is None:
            raise ValueError("该售后记录没有设置对应期限")

        if record.status=="completed":
            raise ValueError("该售后记录已完成，不能创建任务")

        self.sync_aftercare_deadline_tasks(record)

        source_suffix=(
            "return_deadline"
            if deadline_type=="return"
            else "warranty_deadline"
        )

        source_key=f"aftercare:{record.id}:{source_suffix}"

        task=self.repository.get_by_source_key(
            source_key=source_key,
            user_id=user_id
        )

        if task is None:
            raise  RuntimeError("系统任务同步失败")

        return  task