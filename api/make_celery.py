"""Celery 应用装配。

启动：
    uv run celery -A make_celery worker -l info
    uv run celery -A make_celery beat -l info

没配 CELERY_BROKER_URL 时，任务在 API 进程内同步执行（见 tasks/generation.py 的 dispatch）。
"""

from celery import Celery
from kombu import Exchange, Queue

from load_env import load_env

load_env()

from app.config import settings  # noqa: E402
from app.tasks.beat_schedules import BEAT_SCHEDULES  # noqa: E402


def init_celery_app() -> Celery:
    settings.CELERYBEAT_SCHEDULE_FILENAME.parent.mkdir(parents=True, exist_ok=True)
    celery = Celery(settings.APP_NAME)
    celery.conf.update(
        broker_url=settings.CELERY_BROKER_URL or "memory://",
        result_backend=settings.CELERY_RESULT_BACKEND or "cache+memory://",
        beat_schedule_filename=str(settings.CELERYBEAT_SCHEDULE_FILENAME),
        timezone=settings.CELERY_TIMEZONE,
        enable_utc=settings.CELERY_ENABLE_UTC,
        task_track_started=settings.CELERY_TASK_TRACK_STARTED,
        task_acks_late=settings.CELERY_TASK_ACKS_LATE,
        task_always_eager=settings.celery_eager,
        task_reject_on_worker_lost=settings.CELERY_TASK_REJECT_ON_WORKER_LOST,
        beat_schedule=BEAT_SCHEDULES,
        task_queues=(
            Queue("default", Exchange("default"), routing_key="default"),
            Queue("ai-job", Exchange("ai-job"), routing_key="ai-job"),
        ),
        task_default_queue="default",
        # include 里的模块会在 worker / beat 启动时被强制导入，否则任务名解析不到
        include=[
            "app.tasks._runtime",
            "app.tasks.generation",
            "app.tasks.maintenance",
        ],
    )
    celery.autodiscover_tasks(["app.tasks"])
    return celery


celery_app: Celery = init_celery_app()
