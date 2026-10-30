from app.services.cache import BaseCache, CacheKey


class WordSourcesCache(BaseCache):
    __KEY__ = CacheKey.WORD_SOURCES
    expire = 300

    async def invalidate(self) -> int:
        return await self.delete()


class SentenceSourcesCache(BaseCache):
    __KEY__ = CacheKey.SENTENCE_SOURCES
    expire = 300

    async def invalidate(self) -> int:
        return await self.delete()


class DashboardCache(BaseCache):
    __KEY__ = CacheKey.DASHBOARD_OVERVIEW
    expire = 60

    async def invalidate(self) -> int:
        return await self.delete()


class CardThemesCache(BaseCache):
    __KEY__ = CacheKey.CARD_THEMES
    expire = 300

    def __init__(self, module: str = "image"):
        self.module = module
        self._key = self.__KEY__.format(module)

    @property
    def key(self) -> str:
        return self._key

    async def invalidate(self) -> int:
        return await self.delete()


def invalidate_content_caches() -> None:
    """卡片/词库变更后统一清一遍列表级缓存。"""
    import asyncio

    async def _clear():
        await DashboardCache().invalidate()
        await CardThemesCache("image").invalidate()
        await CardThemesCache("video").invalidate()
        await CardThemesCache("music").invalidate()

    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        asyncio.run(_clear())
        return
    loop.create_task(_clear())
