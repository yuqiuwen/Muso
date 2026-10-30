"""应用配置：按 APP_ENV 装载不同环境类，和 networthlens 的约定保持一致。"""

import importlib
import logging
import os
from functools import lru_cache
from pathlib import Path
from typing import Literal
from zoneinfo import ZoneInfo

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

T_ENV = Literal["development", "testing", "production", "unittest"]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(extra="ignore", env_file_encoding="utf-8")

    # FastAPI
    FASTAPI_API_V1_PATH: str = "/v1"
    FASTAPI_TITLE: str = "Muso API"
    FASTAPI_VERSION: str = "0.1.0"
    FASTAPI_SUMMARY: str = "妙作 Muso 内容创作工作台"
    FASTAPI_DESCRIPTION: str = "图文 / 视频 / 音乐 内容生产后台"
    FASTAPI_DOCS_URL: str = "/docs"
    FASTAPI_REDOC_URL: str = "/redoc"
    FASTAPI_OPENAPI_URL: str | None = "/openapi.json"

    # 逗号分隔的 origin 列表。存成 str 是为了避开 pydantic-settings 对 list 的
    # JSON 预解析（`a,b` 不是合法 JSON 会直接抛错），取值走 cors_origins。
    CORS_ALLOWED_ORIGINS: str = ""

    @property
    def cors_origins(self) -> list[str]:
        return [x.strip() for x in self.CORS_ALLOWED_ORIGINS.split(",") if x.strip()]

    APP_NAME: str = "muso"
    ENV: T_ENV = "development"
    TESTING: bool = False
    TIMEZONE: ZoneInfo = ZoneInfo("Asia/Shanghai")
    ENABLE_REQ_LOG: bool = True

    BASE_DIR: Path = Path(__file__).resolve().parent.parent.parent
    STATIC_DIR: Path = BASE_DIR / "storage"
    IMAGE_DIR: Path = BASE_DIR / "storage" / "images"
    LOG_DIR: Path = BASE_DIR / "storage" / "logs"
    STATIC_URL: str = "/static"

    # DB
    SQLALCHEMY_ECHO: bool = False
    DB_MAIN_URL: str = "sqlite+aiosqlite:///./storage/muso.db"

    # Redis（可选）
    REDIS_TIMEOUT: int = 5
    REDIS_CACHE_URL: str | None = None

    # Celery
    CELERY_BROKER_URL: str | None = None
    CELERY_RESULT_BACKEND: str | None = None
    CELERY_TIMEZONE: str = "Asia/Shanghai"
    CELERY_ENABLE_UTC: bool = True
    CELERY_TASK_TRACK_STARTED: bool = True
    CELERY_TASK_ACKS_LATE: bool = True
    CELERY_TASK_ALWAYS_EAGER: bool = False
    CELERYBEAT_SCHEDULE_FILENAME: Path = BASE_DIR / "storage" / "celerybeat-schedule"

    # 内容约束
    MAX_CARD_IMAGES: int = 15
    MAX_TEMPLATE_CHARS: int = 8000

    # 大模型
    MUSO_LLM_MODEL: str = ""
    MUSO_LLM_API_KEY: str = ""
    MUSO_LLM_BASE_URL: str = ""
    MUSO_LLM_TIMEOUT: int = 120

    @property
    def celery_eager(self) -> bool:
        """没配 broker 时自动降级为同步执行，本地开箱即用。"""
        return self.CELERY_TASK_ALWAYS_EAGER or not self.CELERY_BROKER_URL


class DevelopmentConfig(Settings):
    model_config = SettingsConfigDict(env_file=".env", env_ignore_empty=True, env_file_encoding="utf-8")

    DEBUG: bool = True
    LOG_LEVEL: int = logging.INFO
    ENABLE_REQ_LOG: bool = False


class TestingConfig(Settings):
    model_config = SettingsConfigDict(
        env_file=".env.test", env_ignore_empty=True, env_file_encoding="utf-8"
    )

    TESTING: bool = True
    LOG_LEVEL: int = logging.INFO
    DB_MAIN_URL: str = "sqlite+aiosqlite:///./storage/muso-test.db"


class UnittestConfig(TestingConfig):
    model_config = SettingsConfigDict(
        env_file=".env.unittest", env_ignore_empty=True, env_file_encoding="utf-8"
    )


class ProductionConfig(Settings):
    model_config = SettingsConfigDict(env_ignore_empty=True, env_file_encoding="utf-8")

    FASTAPI_DOCS_URL: str | None = None
    FASTAPI_REDOC_URL: str | None = None
    FASTAPI_OPENAPI_URL: str | None = None
    LOG_LEVEL: int = logging.INFO


def load_config_class():
    config_name = os.getenv("APP_ENV", "development")
    cfg_class_name = f"{config_name.capitalize()}Config"
    config_class = getattr(importlib.import_module("app.config"), cfg_class_name)
    return config_class()


@lru_cache()
def get_settings():
    return load_config_class()


settings = get_settings()
