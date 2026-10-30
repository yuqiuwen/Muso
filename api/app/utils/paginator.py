from typing import Generic, Sequence, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")


class PaginatedResponse(BaseModel, Generic[T]):
    items: list[T] = Field(default_factory=list)
    total: int = 0
    page: int = 1
    limit: int = 20
    pages: int = 0

    @classmethod
    def build(cls, items: Sequence[T], total: int, page: int, limit: int) -> "PaginatedResponse[T]":
        pages = (total + limit - 1) // limit if limit else 0
        return cls(items=list(items), total=total, page=page, limit=limit, pages=pages)
