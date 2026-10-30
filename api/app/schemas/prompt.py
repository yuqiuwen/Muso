from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.config import settings
from app.constant import PROMPT_KINDS
from app.schemas.common import EntityModel


class TemplateItem(EntityModel):
    id: str
    name: str
    description: str = ""
    content: str
    # 1 文本 / 2 生图 / 3 其他
    kind: int = 1
    builtin: bool = False
    created_at: datetime | None = None
    updated_at: datetime | None = None
    slots: list[str] = Field(default_factory=list)
    chars: int = 0


class TemplateBrief(EntityModel):
    id: str
    name: str
    description: str = ""
    kind: int = 1
    builtin: bool = False
    slots: list[str] = Field(default_factory=list)
    chars: int = 0
    updated_at: datetime | None = None


class TemplateSavePayload(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    description: str = Field("", max_length=255)
    content: str = Field(..., min_length=1)
    kind: int = 1

    @field_validator("kind")
    @classmethod
    def _check_kind(cls, v: int) -> int:
        if v not in PROMPT_KINDS:
            raise ValueError(f"未知类型 {v}，可选值：1 文本 / 2 生图 / 3 其他")
        return v

    @field_validator("content")
    @classmethod
    def _check_length(cls, v: str) -> str:
        # UI 已经拦过一次，这里守第二道：脚本 / 其他客户端同样不许超限
        if len(v) > settings.MAX_TEMPLATE_CHARS:
            raise ValueError(
                f"模板内容超过 {settings.MAX_TEMPLATE_CHARS:,} 字符上限（当前 {len(v):,} 字符）"
            )
        return v


class RenderPayload(BaseModel):
    template_id: str
    fields: dict[str, object] = Field(default_factory=dict)


class RenderResult(BaseModel):
    text: str
    missing: list[str] = Field(default_factory=list)
