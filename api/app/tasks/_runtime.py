"""Celery 运行时：worker 进程里维护一个常驻 event loop。"""

import asyncio

from celery.signals import worker_process_init, worker_process_shutdown

import app.database.db as db_module
from app.config import settings

_worker_loop: asyncio.AbstractEventLoop | None = None


@worker_process_init.connect
def on_worker_process_init(**kwargs):
    global _worker_loop
    _worker_loop = asyncio.new_event_loop()
    asyncio.set_event_loop(_worker_loop)
    db_module.init_async_engine_and_session(settings.DB_MAIN_URL)


@worker_process_shutdown.connect
def on_worker_process_shutdown(**kwargs):
    global _worker_loop
    if _worker_loop and not _worker_loop.is_closed():
        if db_module.async_engine is not None:
            _worker_loop.run_until_complete(db_module.async_engine.dispose())
        _worker_loop.close()


def ensure_db_initialized() -> None:
    if db_module.async_db_session is None:
        db_module.init_async_engine_and_session(settings.DB_MAIN_URL)


async def _run_and_release(coro):
    try:
        return await coro
    finally:
        # 一次性 loop 跑完要释放连接池，否则下一次 asyncio.run 会拿着绑在旧 loop 上的连接
        if db_module.async_engine is not None:
            await db_module.async_engine.dispose()
            db_module.async_engine = None
            db_module.async_db_session = None


def run_coro(coro):
    if _worker_loop is not None and not _worker_loop.is_closed():
        return _worker_loop.run_until_complete(coro)
    return asyncio.run(_run_and_release(coro))
