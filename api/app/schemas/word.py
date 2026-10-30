from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import EntityModel, PageQueryModel


class WordQuery(PageQueryModel):
    keyword: str = ""
    source: str = ""
    letter: str = ""


class WordBrief(EntityModel):
    id: int
    word: str
    phonetic_uk: str = ""
    phonetic_us: str = ""
    pos: str = ""
    definition: str = ""
    source: str = ""


class WordDetail(WordBrief):
    examples: list[dict] = Field(default_factory=list)
    created_at: datetime | None = None


class DictSourceItem(EntityModel):
    name: str
    filename: str = ""
    entry_count: int = 0
    imported_at: datetime | None = None


class WordLookupItem(BaseModel):
    word: str
    found: bool
    entries: list[WordBrief] = Field(default_factory=list)


class WordLookupPayload(BaseModel):
    words: list[str] = Field(default_factory=list, max_length=200)

    @field_validator("words")
    @classmethod
    def _strip(cls, v: list[str]) -> list[str]:
        return [w.strip() for w in v if w and w.strip()]


class WordMultiQuery(BaseModel):
    """多词搜索：直接收原文，分隔符在服务端拆，前端不用重复实现一遍。"""

    text: str = ""
    source: str = ""
    limit: int = Field(default=50, ge=1, le=200)


class WordMultiResult(BaseModel):
    items: list[WordLookupItem] = Field(default_factory=list)
    total: int = 0
    found: int = 0
    missing: list[str] = Field(default_factory=list)
    truncated: bool = False
