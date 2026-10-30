from __future__ import annotations

import json

from sqlalchemy.ext.asyncio import AsyncSession

from app.repo.word import word_repo
from app.schemas.word import (
    DictSourceItem,
    WordBrief,
    WordDetail,
    WordLookupItem,
    WordMultiResult,
)
from app.services.cache.content import WordSourcesCache
from app.utils.common import normalize_word_key, split_words


def _examples(raw: str) -> list[dict]:
    try:
        data = json.loads(raw or "[]")
    except json.JSONDecodeError:
        return []
    return [x for x in data if isinstance(x, dict)] if isinstance(data, list) else []


def to_brief(row) -> WordBrief:
    return WordBrief(
        id=row.id,
        word=row.word,
        phonetic_uk=row.phonetic_uk or "",
        phonetic_us=row.phonetic_us or "",
        pos=row.pos or "",
        definition=row.definition or "",
        source=row.source or "",
    )


def to_detail(row) -> WordDetail:
    return WordDetail(
        **to_brief(row).model_dump(),
        examples=_examples(row.examples),
        created_at=row.created_at,
    )


class WordService:
    async def list(self, session: AsyncSession, *, keyword="", source="", letter="", offset=0, limit=20):
        rows, total = await word_repo.list(
            session, keyword=keyword, source=source, letter=letter, offset=offset, limit=limit
        )
        return [to_brief(r) for r in rows], total

    async def get(self, session: AsyncSession, word_id: int) -> WordDetail | None:
        row = await word_repo.get(session, word_id)
        return to_detail(row) if row else None

    async def sources(self, session: AsyncSession) -> list[DictSourceItem]:
        cache = WordSourcesCache()
        cached = await cache.get()
        if cached:
            return [DictSourceItem(**x) for x in cached]

        rows = await word_repo.sources(session)
        items = [
            DictSourceItem(
                name=r.name,
                filename=r.filename or "",
                entry_count=r.entry_count or 0,
                imported_at=r.imported_at,
            )
            for r in rows
        ]
        await cache.add([i.model_dump(mode="json") for i in items])
        return items

    async def lookup(self, session: AsyncSession, words: list[str]) -> list[WordLookupItem]:
        keys = [normalize_word_key(w) for w in words]
        grouped = await word_repo.search_keys(session, keys)
        result: list[WordLookupItem] = []
        for word, key in zip(words, keys):
            entries = grouped.get(key, [])
            result.append(
                WordLookupItem(word=word, found=bool(entries), entries=[to_brief(e) for e in entries])
            )
        return result

    async def count(self, session: AsyncSession) -> int:
        return await word_repo.count(session)

    async def multi_search(
        self,
        session: AsyncSession,
        *,
        text: str,
        source: str = "",
        limit: int = 50,
    ) -> WordMultiResult:
        """多词搜索：逗号/分号/换行分隔，逐词精确命中（走 word_key 索引）。

        返回顺序与输入一致；没收录的词放进 `missing`，前端直接标灰，
        不做模糊兜底 —— 词库 13 万条里 `abandon%` 这类前缀会炸出几十条，
        反而让「批量查词」变得没法看。
        """
        words: list[str] = []
        seen: set[str] = set()
        for word in split_words(text):
            key = normalize_word_key(word)
            if key and key not in seen:
                seen.add(key)
                words.append(word)

        truncated = len(words) > limit
        if truncated:
            words = words[:limit]
        if not words:
            return WordMultiResult()

        keys = [normalize_word_key(w) for w in words]
        grouped = await word_repo.search_keys(session, keys, source=source)

        items: list[WordLookupItem] = []
        missing: list[str] = []
        for word, key in zip(words, keys, strict=True):
            entries = [to_brief(row) for row in grouped.get(key, [])]
            if not entries:
                missing.append(word)
            items.append(WordLookupItem(word=word, found=bool(entries), entries=entries))

        return WordMultiResult(
            items=items,
            total=len(words),
            found=len(words) - len(missing),
            missing=missing,
            truncated=truncated,
        )


word_service = WordService()
