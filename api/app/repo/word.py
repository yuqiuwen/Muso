from __future__ import annotations

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.word import DictSource, Word


class WordRepo:
    async def list(
        self,
        session: AsyncSession,
        *,
        keyword: str = "",
        source: str = "",
        letter: str = "",
        offset: int = 0,
        limit: int = 20,
    ) -> tuple[list[Word], int]:
        stmt = select(Word)
        count_stmt = select(func.count(Word.id))

        conditions = []
        if keyword:
            like = f"%{keyword.strip()}%"
            conditions.append(or_(Word.word.like(like), Word.definition.like(like)))
        if source:
            conditions.append(Word.source == source)
        if letter:
            conditions.append(Word.word_key.like(f"{letter.lower()}%"))
        if conditions:
            stmt = stmt.where(*conditions)
            count_stmt = count_stmt.where(*conditions)

        total = int((await session.execute(count_stmt)).scalar_one())
        stmt = stmt.order_by(Word.word_key.asc(), Word.source.asc()).offset(offset).limit(limit)
        rows = (await session.execute(stmt)).scalars().all()
        return list(rows), total

    async def get(self, session: AsyncSession, word_id: int) -> Word | None:
        return await session.get(Word, word_id)

    async def by_word(self, session: AsyncSession, word_key: str, limit: int = 20) -> list[Word]:
        stmt = (
            select(Word)
            .where(Word.word_key == word_key)
            .order_by(Word.source.asc())
            .limit(limit)
        )
        return list((await session.execute(stmt)).scalars().all())

    async def search_keys(
        self, session: AsyncSession, keys: list[str], source: str = ""
    ) -> dict[str, list[Word]]:
        """批量取词：一次 IN 查询，按 word_key 分组，避免 N+1。"""
        if not keys:
            return {}
        stmt = select(Word).where(Word.word_key.in_(keys))
        if source:
            stmt = stmt.where(Word.source == source)
        stmt = stmt.order_by(Word.source.asc())
        grouped: dict[str, list[Word]] = {k: [] for k in keys}
        for row in (await session.execute(stmt)).scalars().all():
            grouped.setdefault(row.word_key, []).append(row)
        return grouped

    async def sources(self, session: AsyncSession) -> list[DictSource]:
        stmt = select(DictSource).order_by(DictSource.id.asc())
        return list((await session.execute(stmt)).scalars().all())

    async def count(self, session: AsyncSession) -> int:
        return int((await session.execute(select(func.count(Word.id)))).scalar_one())


word_repo = WordRepo()
