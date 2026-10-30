"""缓存客户端。

有 Redis 就用 Redis；没配（本地默认）就退化成进程内 TTL 字典。
这样服务层只依赖 `cache.get/set/delete/incr` 四个方法，不需要到处写 if。
"""

import json
import time
from typing import Any

from app.config import settings
from app.core.loggers import app_logger


class _MemoryCache:
    def __init__(self) -> None:
        self._data: dict[str, tuple[float, str]] = {}

    async def get(self, key: str) -> str | None:
        item = self._data.get(key)
        if not item:
            return None
        expire_at, value = item
        if expire_at and expire_at < time.time():
            self._data.pop(key, None)
            return None
        return value

    async def set(self, key: str, value: str, ex: int | None = None) -> bool:
        self._data[key] = (time.time() + ex if ex else 0, value)
        return True

    async def delete(self, *keys: str) -> int:
        return sum(1 for k in keys if self._data.pop(k, None) is not None)

    async def delete_prefix(self, prefix: str) -> int:
        targets = [k for k in self._data if k.startswith(prefix)]
        for k in targets:
            self._data.pop(k, None)
        return len(targets)

    async def aclose(self) -> None:
        self._data.clear()


class Cache:
    def __init__(self) -> None:
        self._redis = None
        self._memory = _MemoryCache()

    async def init(self, url: str | None) -> None:
        if not url:
            app_logger.info("未配置 Redis，缓存降级为进程内 TTL 字典")
            return
        try:
            from redis.asyncio import Redis

            self._redis = Redis.from_url(
                url, encoding="utf-8", decode_responses=True, socket_timeout=settings.REDIS_TIMEOUT
            )
            await self._redis.ping()
            app_logger.info(f"Redis 已连接 {url}")
        except Exception as exc:  # pragma: no cover - 取决于本地环境
            app_logger.warning(f"Redis 连接失败，降级为进程内缓存: {exc}")
            self._redis = None

    async def get(self, key: str) -> str | None:
        if self._redis:
            return await self._redis.get(key)
        return await self._memory.get(key)

    async def set(self, key: str, value: str, ex: int | None = None) -> bool:
        if self._redis:
            return bool(await self._redis.set(key, value, ex=ex))
        return await self._memory.set(key, value, ex=ex)

    async def get_json(self, key: str) -> Any | None:
        raw = await self.get(key)
        if raw is None:
            return None
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return None

    async def set_json(self, key: str, value: Any, ex: int | None = None) -> bool:
        return await self.set(key, json.dumps(value, ensure_ascii=False), ex=ex)

    async def delete(self, *keys: str) -> int:
        if not keys:
            return 0
        if self._redis:
            return int(await self._redis.delete(*keys))
        return await self._memory.delete(*keys)

    async def delete_prefix(self, prefix: str) -> int:
        """按前缀失效（列表缓存用），Redis 下走 SCAN 而不是 KEYS。"""
        if not self._redis:
            return await self._memory.delete_prefix(prefix)
        deleted = 0
        async for key in self._redis.scan_iter(match=f"{prefix}*", count=200):
            deleted += int(await self._redis.delete(key))
        return deleted

    async def aclose(self) -> None:
        if self._redis:
            await self._redis.aclose()
        await self._memory.aclose()


cache = Cache()
