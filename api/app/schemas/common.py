from typing import Any, Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field

T = TypeVar("T")


class EntityModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class PageQueryModel(BaseModel):
    page: int = Field(1, ge=1)
    limit: int = Field(20, gt=0, le=200)

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.limit


class IdsModel(BaseModel):
    ids: list[int]


class OptionModel(EntityModel):
    label: str
    value: Any
    count: int = 0


class PageModel(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    limit: int
    pages: int
