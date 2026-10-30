from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.prompt import PromptTemplate


class PromptRepo:
    async def list(self, session: AsyncSession) -> list[PromptTemplate]:
        stmt = select(PromptTemplate).order_by(
            PromptTemplate.builtin.desc(), PromptTemplate.updated_at.desc()
        )
        return list((await session.execute(stmt)).scalars().all())

    async def get(self, session: AsyncSession, uid: str) -> PromptTemplate | None:
        stmt = select(PromptTemplate).where(PromptTemplate.uid == uid)
        return (await session.execute(stmt)).scalars().first()

    async def count(self, session: AsyncSession) -> int:
        return int((await session.execute(select(func.count(PromptTemplate.id)))).scalar_one())

    async def add(self, session: AsyncSession, obj: PromptTemplate) -> PromptTemplate:
        session.add(obj)
        await session.commit()
        await session.refresh(obj)
        return obj

    async def delete(self, session: AsyncSession, obj: PromptTemplate) -> None:
        await session.delete(obj)
        await session.commit()


prompt_repo = PromptRepo()
