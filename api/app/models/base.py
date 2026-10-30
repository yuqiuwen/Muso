"""模型基类：统一命名约定 + 主键 + 时间戳。

SQLite 没有 `on update current_timestamp`，所以 utime 用 Python 侧 default/onupdate，
配合 `eager_defaults` 保证 commit 后对象上的值是最新的。
"""

from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy import DateTime, MetaData, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from app.config import settings

convention = {
    "ix": "ix_%(table_name)s_%(column_0_N_label)s",
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


def local_now() -> datetime:
    """统一用应用时区的 naive 时间，SQLite 里存成 'YYYY-MM-DD HH:MM:SS.ffffff'。"""
    return datetime.now(ZoneInfo(settings.CELERY_TIMEZONE)).replace(tzinfo=None)


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=convention)


class BaseModel(Base):
    __abstract__ = True

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)


class TimeModel(Base):
    __abstract__ = True

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=local_now, server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=local_now, onupdate=local_now, server_default=func.now(), nullable=False
    )
