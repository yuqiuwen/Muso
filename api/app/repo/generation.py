from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.generation import GenerationTask


class GenerationRepo:
    async def add(self, session: AsyncSession, task: GenerationTask) -> GenerationTask:
        session.add(task)
        await session.commit()
        await session.refresh(task)
        return task

    async def get(self, session: AsyncSession, uid: str) -> GenerationTask | None:
        stmt = select(GenerationTask).where(GenerationTask.uid == uid)
        return (await session.execute(stmt)).scalars().first()

    async def save(self, session: AsyncSession, task: GenerationTask) -> GenerationTask:
        await session.commit()
        await session.refresh(task)
        return task


generation_repo = GenerationRepo()
