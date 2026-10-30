"""卡片文案生成任务。

`dispatch()` 是唯一入口：
- 配了 broker → 丢给 Celery，返回 False（前端轮询任务状态）
- 没配 broker → 返回 True，调用方直接 await 执行（本地开箱即用）
"""

from celery import shared_task

from app.config import settings
from app.core.loggers import app_logger
from app.tasks._runtime import ensure_db_initialized, run_coro

TASK_NAME = "app.tasks.generation.generate_card_copy"


async def _run(uid: str) -> None:
    from app.services.generation import generation_service

    await generation_service.run(uid)


@shared_task(name=TASK_NAME)
def generate_card_copy(uid: str) -> dict:
    ensure_db_initialized()
    run_coro(_run(uid))
    app_logger.info(f"生成任务完成: {uid}")
    return {"uid": uid, "status": "done"}


def dispatch(uid: str) -> bool:
    """返回 True 表示「调用方自己同步执行」。"""
    if settings.celery_eager:
        return True
    generate_card_copy.delay(uid)
    return False
