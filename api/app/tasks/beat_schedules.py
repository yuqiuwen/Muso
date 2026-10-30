"""周期任务表。新增任务在这里加一条，worker/beat 启动即生效。"""

from celery.schedules import crontab

BEAT_SCHEDULES = {
    # 每天凌晨清掉 7 天前的生成任务记录，避免 generation_tasks 无限增长。
    "cleanup-generation-tasks": {
        "task": "app.tasks.maintenance.cleanup_generation_tasks",
        "schedule": crontab(hour=3, minute=10),
        "args": (7,),
    },
}
