"""运维类任务：清理历史生成记录。"""

from datetime import timedelta

from celery import shared_task
from sqlalchemy import delete

from app.core.loggers import app_logger
from app.models.base import local_now
from app.models.generation import GenerationTask
from app.tasks._runtime import ensure_db_initialized, run_coro

TASK_NAME = "app.tasks.maintenance.cleanup_generation_tasks"


async def _cleanup(days: int) -> int:
    from app.database.db import async_db_session

    if async_db_session is None:
        raise RuntimeError("数据库会话未初始化")

    cutoff = local_now() - timedelta(days=days)
    async with async_db_session() as session:
        result = await session.execute(
            delete(GenerationTask).where(GenerationTask.created_at < cutoff)
        )
        await session.commit()
        return int(result.rowcount or 0)


@shared_task(name=TASK_NAME)
def cleanup_generation_tasks(days: int = 7) -> dict:
    ensure_db_initialized()
    removed = run_coro(_cleanup(days))
    app_logger.info(f"清理生成任务 {removed} 条（早于 {days} 天）")
    return {"removed": removed}
