from typing import Annotated, AsyncGenerator

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.db import get_session

SessionDep = Annotated[AsyncSession, Depends(get_session)]


async def paginate_dep() -> AsyncGenerator[None, None]:
    yield None
