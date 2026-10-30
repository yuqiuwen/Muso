"""异步数据库引擎与会话。

SQLite 单文件场景用 NullPool + WAL：避免多进程（uvicorn reload / celery worker）
抢同一份连接池，读多写少的场景下 WAL 也不会互相阻塞。
"""

import sys
from typing import AsyncGenerator

from sqlalchemy import URL, event
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool

from app.config import settings
from app.core.loggers import app_logger

async_engine: AsyncEngine | None = None
async_db_session: async_sessionmaker[AsyncSession] | None = None


def _is_sqlite(url: str | URL) -> bool:
    return str(url).startswith("sqlite")


def init_async_engine_and_session(
    url: str | URL,
) -> tuple[AsyncEngine, async_sessionmaker[AsyncSession]]:
    global async_engine, async_db_session

    kwargs: dict = {
        "echo": settings.SQLALCHEMY_ECHO,
        "future": True,
        "pool_pre_ping": True,
    }
    if _is_sqlite(url):
        kwargs["poolclass"] = NullPool
        kwargs["connect_args"] = {"check_same_thread": False, "timeout": 30}
    else:
        kwargs.update(pool_size=10, max_overflow=20, pool_timeout=30)

    try:
        async_engine = create_async_engine(url, **kwargs)
    except Exception as exc:  # pragma: no cover
        app_logger.critical(f"数据库连接失败 {exc}")
        sys.exit(1)

    if _is_sqlite(url):

        @event.listens_for(async_engine.sync_engine, "connect")
        def _set_sqlite_pragma(dbapi_connection, _record):  # noqa: ANN001
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA synchronous=NORMAL")
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    async_db_session = async_sessionmaker(
        bind=async_engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autoflush=False,
    )
    app_logger.info(f"初始化 db[{async_engine.url}] 成功")
    return async_engine, async_db_session


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    if async_db_session is None:  # 脚本直调时兜底
        init_async_engine_and_session(settings.DB_MAIN_URL)
    async with async_db_session() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
