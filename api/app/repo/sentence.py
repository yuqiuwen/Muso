from __future__ import annotations

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.sentence import Sentence, SentenceSource
from app.utils.common import sentence_key


class SentenceRepo:
    async def list(
        self,
        session: AsyncSession,
        *,
        keyword: str = "",
        source: str = "",
        min_words: int = 0,
        max_words: int = 0,
        offset: int = 0,
        limit: int = 20,
    ) -> tuple[list[Sentence], int]:
        stmt = select(Sentence)
        count_stmt = select(func.count(Sentence.id))

        conditions = []
        if keyword:
            like = f"%{keyword.strip()}%"
            conditions.append(or_(Sentence.en.like(like), Sentence.zh.like(like)))
        if source:
            conditions.append(Sentence.source == source)
        if min_words:
            conditions.append(Sentence.word_count >= min_words)
        if max_words:
            conditions.append(Sentence.word_count <= max_words)
        if conditions:
            stmt = stmt.where(*conditions)
            count_stmt = count_stmt.where(*conditions)

        total = int((await session.execute(count_stmt)).scalar_one())

        # 有关键词时把短句排前面（命中更聚焦），无关键词按入库顺序
        order = (
            (Sentence.word_count.asc(), Sentence.id.asc())
            if keyword
            else (Sentence.id.asc(),)
        )
        stmt = stmt.order_by(*order).offset(offset).limit(limit)
        rows = (await session.execute(stmt)).scalars().all()
        return list(rows), total

    async def get(self, session: AsyncSession, sentence_id: int) -> Sentence | None:
        return await session.get(Sentence, sentence_id)

    async def for_word(self, session: AsyncSession, word: str, limit: int = 5) -> list[Sentence]:
        """整词匹配：en_key 首尾带空格，`LIKE '% word %'` 不会命中 better 里的 bet。"""
        key = sentence_key(word)
        stmt = (
            select(Sentence)
            .where(Sentence.en_key.like(f"%{key}%"))
            .order_by(Sentence.word_count.asc(), Sentence.id.asc())
            .limit(limit)
        )
        return list((await session.execute(stmt)).scalars().all())

    async def sources(self, session: AsyncSession) -> list[SentenceSource]:
        stmt = select(SentenceSource).order_by(SentenceSource.id.asc())
        return list((await session.execute(stmt)).scalars().all())

    async def count(self, session: AsyncSession) -> int:
        return int((await session.execute(select(func.count(Sentence.id)))).scalar_one())


sentence_repo = SentenceRepo()
