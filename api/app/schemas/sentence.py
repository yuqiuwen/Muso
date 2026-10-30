from datetime import datetime

from pydantic import Field

from app.schemas.common import EntityModel, PageQueryModel


class SentenceQuery(PageQueryModel):
    keyword: str = ""
    source: str = ""
    min_words: int = 0
    max_words: int = 0


class SentenceItem(EntityModel):
    id: int
    en: str
    zh: str = ""
    word_count: int = 0
    source: str = ""


class SentenceDetail(SentenceItem):
    created_at: datetime | None = None


class SentenceSourceItem(EntityModel):
    name: str
    filename: str = ""
    entry_count: int = 0
    imported_at: datetime | None = None


class ForWordQuery(EntityModel):
    word: str
    limit: int = Field(5, ge=1, le=50)
