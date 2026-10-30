"""缓存层。

约定：一个业务缓存一个类，`__KEY__` 是模板，构造时拼出完整 key。
读侧先查缓存，miss 再查库；写侧（导入、保存）主动 invalidate。
"""

from abc import ABC, abstractmethod
from enum import StrEnum
from typing import Any

from app.database.redis_client import cache


class CacheKey(StrEnum):
    WORD_SOURCES = "muso:word:sources"
    SENTENCE_SOURCES = "muso:sentence:sources"
    DASHBOARD_OVERVIEW = "muso:dashboard:overview"
    CARD_THEMES = "muso:card:themes:{}"


class BaseCache(ABC):
    __KEY__: str = ""
    expire: int = 300

    @property
    def key(self) -> str:
        return self.__KEY__

    async def get(self) -> Any | None:
        return await cache.get_json(self.key)

    async def add(self, data: Any, expire: int | None = None) -> bool:
        return await cache.set_json(self.key, data, ex=expire or self.expire)

    async def delete(self) -> int:
        return await cache.delete(self.key)

    @abstractmethod
    async def invalidate(self) -> int:
        ...
