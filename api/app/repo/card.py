from __future__ import annotations

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.card import Card, CardImage


class CardRepo:
    def _base(self):
        return select(Card).options(selectinload(Card.images))

    async def list(
        self,
        session: AsyncSession,
        *,
        keyword: str = "",
        status: str = "",
        module: str = "",
        theme: str = "",
        offset: int = 0,
        limit: int = 20,
    ) -> tuple[list[Card], int]:
        stmt = self._base()
        count_stmt = select(func.count(Card.id))

        conditions = []
        if keyword:
            like = f"%{keyword.strip()}%"
            conditions.append(
                or_(Card.title.like(like), Card.theme.like(like), Card.caption.like(like))
            )
        if status:
            conditions.append(Card.status == status)
        if module:
            conditions.append(Card.module == module)
        if theme:
            conditions.append(Card.theme == theme)
        if conditions:
            stmt = stmt.where(*conditions)
            count_stmt = count_stmt.where(*conditions)

        total = int((await session.execute(count_stmt)).scalar_one())
        stmt = (
            stmt.order_by(Card.is_pinned.desc(), Card.sort_order.desc(), Card.id.desc())
            .offset(offset)
            .limit(limit)
        )
        rows = (await session.execute(stmt)).scalars().unique().all()
        return list(rows), total

    async def get(self, session: AsyncSession, card_id: int) -> Card | None:
        stmt = self._base().where(Card.id == card_id)
        return (await session.execute(stmt)).scalars().unique().first()

    async def recent(self, session: AsyncSession, module: str = "image", limit: int = 5) -> list[Card]:
        stmt = (
            self._base()
            .where(Card.module == module)
            .order_by(Card.updated_at.desc())
            .limit(limit)
        )
        return list((await session.execute(stmt)).scalars().unique().all())

    async def count(self, session: AsyncSession) -> int:
        return int((await session.execute(select(func.count(Card.id)))).scalar_one())

    async def count_by(self, session: AsyncSession, **filters) -> int:
        stmt = select(func.count(Card.id))
        for key, value in filters.items():
            stmt = stmt.where(getattr(Card, key) == value)
        return int((await session.execute(stmt)).scalar_one())

    async def status_counts(self, session: AsyncSession, module: str) -> dict[str, int]:
        stmt = select(Card.status, func.count(Card.id)).where(Card.module == module)
        stmt = stmt.group_by(Card.status)
        return {row[0]: int(row[1]) for row in (await session.execute(stmt)).all()}

    async def themes(self, session: AsyncSession, module: str = "image") -> list[str]:
        stmt = (
            select(Card.theme)
            .where(Card.module == module, Card.theme != "")
            .group_by(Card.theme)
            .order_by(func.count(Card.id).desc())
        )
        return [row[0] for row in (await session.execute(stmt)).all()]

    async def add(self, session: AsyncSession, card: Card) -> Card:
        session.add(card)
        await session.commit()
        await session.refresh(card)
        return card

    async def save(self, session: AsyncSession, card: Card) -> Card:
        await session.commit()
        await session.refresh(card)
        return card

    async def delete(self, session: AsyncSession, card: Card) -> None:
        await session.delete(card)
        await session.commit()

    async def max_sort(self, session: AsyncSession) -> int:
        value = (await session.execute(select(func.max(Card.sort_order)))).scalar()
        return int(value or 0)

    async def images_of(self, session: AsyncSession, card_id: int) -> list[CardImage]:
        stmt = (
            select(CardImage)
            .where(CardImage.card_id == card_id)
            .order_by(CardImage.position.asc())
        )
        return list((await session.execute(stmt)).scalars().all())


card_repo = CardRepo()
