from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.constant import CardModule, CardStatus
from app.schemas.common import EntityModel, PageQueryModel
from app.utils.common import split_words


class CardImageItem(BaseModel):
    id: int | None = None
    path: str
    url: str = ""
    # 磁盘绝对路径，前端「复制图片路径」复制的是它（能直接在 Finder 里定位）
    local_path: str = ""
    position: int = 0
    caption: str = ""


class CardQuery(PageQueryModel):
    keyword: str = ""
    status: str = ""
    module: str = CardModule.IMAGE
    theme: str = ""


class CardItem(EntityModel):
    id: int
    module: str
    status: str
    card_type: str
    theme: str = ""
    title: str
    caption: str = ""
    cover: str = ""
    image_count: int = 0
    words: list[str] = Field(default_factory=list)
    is_pinned: bool = False
    created_at: datetime | None = None
    updated_at: datetime | None = None
    published_at: datetime | None = None


class CardDetail(CardItem):
    story: str = ""
    images: list[CardImageItem] = Field(default_factory=list)
    card_data: dict = Field(default_factory=dict)


class CardSavePayload(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    module: str = CardModule.IMAGE
    status: str = CardStatus.DRAFT
    card_type: str = "图文卡片"
    theme: str = Field("", max_length=120)
    story: str = ""
    caption: str = ""
    words: list[str] | str = Field(default_factory=list)
    # None 表示「不改动现有配图」；传空数组才是清空
    images: list[str] | None = None
    card_data: dict = Field(default_factory=dict)

    @field_validator("words", mode="before")
    @classmethod
    def _words(cls, v):
        return split_words(v)


class CardImagesPayload(BaseModel):
    paths: list[str] = Field(default_factory=list)


class CardImageOrderPayload(BaseModel):
    paths: list[str] = Field(..., min_length=1)


class CardStatusPayload(BaseModel):
    status: str


class CardImportPayload(BaseModel):
    text: str


class CardImportResult(BaseModel):
    created: list[int] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)
