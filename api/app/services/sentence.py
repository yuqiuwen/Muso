from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.repo.sentence import sentence_repo
from app.schemas.sentence import SentenceDetail, SentenceItem, SentenceSourceItem
from app.services.cache.content import SentenceSourcesCache


def to_item(row) -> SentenceItem:
    return SentenceItem(
        id=row.id,
        en=row.en,
        zh=row.zh or "",
        word_count=row.word_count or 0,
        source=row.source or "",
    )


class SentenceService:
    async def list(
        self,
        session: AsyncSession,
        *,
        keyword="",
        source="",
        min_words=0,
        max_words=0,
        offset=0,
        limit=20,
    ):
        rows, total = await sentence_repo.list(
            session,
            keyword=keyword,
            source=source,
            min_words=min_words,
            max_words=max_words,
            offset=offset,
            limit=limit,
        )
        return [to_item(r) for r in rows], total

    async def get(self, session: AsyncSession, sentence_id: int) -> SentenceDetail | None:
        row = await sentence_repo.get(session, sentence_id)
        if not row:
            return None
        return SentenceDetail(**to_item(row).model_dump(), created_at=row.created_at)

    async def for_word(self, session: AsyncSession, word: str, limit: int = 5) -> list[SentenceItem]:
        rows = await sentence_repo.for_word(session, word, limit)
        return [to_item(r) for r in rows]

    async def sources(self, session: AsyncSession) -> list[SentenceSourceItem]:
        cache = SentenceSourcesCache()
        cached = await cache.get()
        if cached:
            return [SentenceSourceItem(**x) for x in cached]
        rows = await sentence_repo.sources(session)
        items = [
            SentenceSourceItem(
                name=r.name,
                filename=r.filename or "",
                entry_count=r.entry_count or 0,
                imported_at=r.imported_at,
            )
            for r in rows
        ]
        await cache.add([i.model_dump(mode="json") for i in items])
        return items

    async def count(self, session: AsyncSession) -> int:
        return await sentence_repo.count(session)


sentence_service = SentenceService()
