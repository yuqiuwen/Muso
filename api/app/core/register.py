"""应用装配：lifespan / 路由自动注册 / 静态资源 / 异常处理。

路由注册靠 pkgutil 扫描 `app.routers.<version>.*`，新增一个模块只要丢一个带
`router` 变量的文件进去，不用回来改注册表。
"""

import importlib
import pkgutil
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import APIRouter, FastAPI
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.core.http_handler import register_exc_handler
from app.core.loggers import AppLogger, app_logger
from app.core.middleware import register_middleware
from app.database.db import init_async_engine_and_session
from app.database.redis_client import cache
from app.routers import register_all_routes


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    init_async_engine_and_session(settings.DB_MAIN_URL)

    # 建表 + 补齐列（SQLite 下没有 alembic，用幂等的 create_all + 轻量迁移）
    from app.database.init_db import init_db

    await init_db()

    await cache.init(settings.REDIS_CACHE_URL)
    app_logger.info(f"Muso API 启动完成 · env={settings.ENV} · db={settings.DB_MAIN_URL}")

    yield

    await cache.aclose()


def register_static(app: FastAPI) -> None:
    settings.IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    app.mount(
        settings.STATIC_URL,
        StaticFiles(directory=str(settings.STATIC_DIR)),
        name="static",
    )


def register_all(app: FastAPI) -> None:
    register_all_routes(app)
    register_static(app)
    register_middleware(app)
    register_exc_handler(app)


def create_app() -> FastAPI:
    AppLogger.init()
    app = FastAPI(
        title=settings.FASTAPI_TITLE,
        version=settings.FASTAPI_VERSION,
        summary=settings.FASTAPI_SUMMARY,
        description=settings.FASTAPI_DESCRIPTION,
        docs_url=settings.FASTAPI_DOCS_URL,
        redoc_url=settings.FASTAPI_REDOC_URL,
        openapi_url=settings.FASTAPI_OPENAPI_URL,
        lifespan=lifespan,
    )
    register_all(app)
    return app
