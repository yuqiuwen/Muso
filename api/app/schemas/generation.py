from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.common import EntityModel


class GeneratePayload(BaseModel):
    template_id: str | None = None
    fields: dict[str, object] = Field(default_factory=dict)
    card_id: int | None = None
    # 只渲染模板不调模型（调试 / 没配 key 时也能用）
    dry_run: bool = False


class GenerationTaskItem(EntityModel):
    id: int
    uid: str
    card_id: int | None = None
    template_id: str | None = None
    kind: str = "card_copy"
    status: str
    engine: str = ""
    prompt: str = ""
    result: dict = Field(default_factory=dict)
    error: str = ""
    created_at: datetime | None = None
    updated_at: datetime | None = None


class DashboardStat(BaseModel):
    label: str
    value: int
    hint: str = ""


class ModuleStat(BaseModel):
    module: str
    label: str
    total: int
    draft: int
    published: int
    enabled: bool = True


class DashboardOverview(BaseModel):
    stats: list[DashboardStat]
    modules: list[ModuleStat]
    status_counts: dict[str, int] = Field(default_factory=dict)
    recent_cards: list[dict] = Field(default_factory=list)
