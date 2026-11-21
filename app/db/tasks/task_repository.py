from datetime import timezone, datetime

from sqlalchemy import select, func, case
from sqlalchemy.orm import Session
from sqlalchemy.dialects.postgresql import insert

from app.db.models import Task
from app.utils.pagination import calculate_offset

class TaskRepository:
    def __init__(self,db:Session):
        self.db=db

    def create(self,task_data:dict)->Task:
        """创建任务"""
        task=Task(**task_data)
        self.db.add(task)
        self.db.flush()
        self.db.refresh(task)
        return task

    def get_by_id(self,task_id:int,user_id:int)->Task|None:
        """查询当前用户的指定任务"""
        statement=select(Task).where(
            Task.id==task_id,
            Task.user_id==user_id
        )
        return self.db.scalar(statement)

    def get_by_source_key(self,source_key:str,user_id:int)->Task|None:
        """根据自动任务来源标识查询，用于去重"""
        statement = select(Task).where(
            Task.source_key == source_key,
            Task.user_id == user_id
        )
        return self.db.scalar(statement)

    def list_tasks(
            self,
            user_id:int,
            page:int,
            page_size:int,
            status:str|None=None,
            keyword:str|None=None,
            source_type:str|None=None,
            priority:str|None=None
    )->tuple[list[Task],int]:
        """分页查询当前用户任务"""
        conditions=[Task.user_id==user_id]
        if status:
            conditions.append(Task.status==status)
        if priority:
            conditions.append(Task.priority==priority)
        if source_type:
            conditions.append(Task.source_type==source_type)
        if keyword:
            conditions.append(Task.title.ilike(f"%{keyword.strip()}%"))

        #   总数查询
        count_statement=(
            select(func.count())
            .select_from(Task)
            .where(*conditions)
        )
        total=self.db.scalar(count_statement) or 0

        #分页查询：未完成任务优先，在按计划时间和创建时间排序
        statement=(
            select(Task).where(*conditions)
            .order_by(
                case(
                    (Task.status == "pending", 1),
                    (Task.status == "in_progress", 2),
                    (Task.status == "completed", 3),
                    (Task.status == "cancelled", 4),
                    else_=5,
                ),
                Task.scheduled_at.asc().nullslast(),
                Task.created_at.desc(),
            )
            .offset( calculate_offset(page, page_size))
            .limit(page_size)
        )
        items=list(self.db.scalars(statement).all())
        return  items,total

    def update(self,task:Task,update_data:dict)->Task:
        """更新任务字段"""
        for field,value in update_data.items():
            setattr(task,field,value)
        self.db.flush()
        self.db.refresh(task)
        return task

    def delete(self,task:Task)->None:
        """删除任务"""
        self.db.delete(task)
        self.db.flush()

    def get_task_stats(self,user_id:int)->dict:
        """
        统计当前用户的全部任务
        不受列表搜索和筛选条件影响
        """
        now=datetime.now(timezone.utc)

        # func.count()：统计符合条件的记录数量。
        # case()：为符合条件的任务计数，不符合的任务不计入。
        statement=(
            select(
                func.count(Task.id).label("total"),
                func.count(
                    case((Task.status=="pending",1))
                ).label("pending"),
                func.count(
                    case((Task.status == "in_progress", 1))
                ).label("in_progress"),
                func.count(
                    case((Task.status == "completed", 1))
                ).label("completed"),
                func.count(
                    case((Task.status == "cancelled", 1))
                ).label("cancelled"),
                func.count(
                    case(
                        (
                            (Task.scheduled_at < now)
                            & (Task.status.in_(["pending", "in_progress"])),
                            1,
                        )
                    )
                ).label("overdue"),
                func.count(
                    case((Task.priority == "high", 1))
                ).label("high_priority"),
            )
            .where(Task.user_id==user_id)
        )
        result=self.db.execute(statement).one()
        return {
            "total": result.total,
            "pending": result.pending,
            "in_progress": result.in_progress,
            "completed": result.completed,
            "cancelled": result.cancelled,
            "overdue": result.overdue,
            "high_priority": result.high_priority,
        }

    def create_system_task_if_absent(self, task_data: dict) -> bool:
        """
        创建系统自动任务。

        返回：
        - True：本次成功创建
        - False：该来源任务已经存在，忽略本次插入

        数据库唯一约束是并发去重的最终保障。
        """
        statement = (
            insert(Task)
            .values(**task_data)
            .on_conflict_do_nothing(
                constraint="uq_task_user_source_key"
            )
            .returning(Task.id)
        )
        created_id = self.db.scalar(statement)

        return created_id is not None