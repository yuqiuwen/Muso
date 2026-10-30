"""AI 生成任务：异步（Celery）执行，前端轮询任务状态。"""

from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseModel, local_now


class GenerationTask(BaseModel):
    __tablename__ = "generation_tasks"

    uid: Mapped[str] = mapped_column(String(40), unique=True, nullable=False, index=True)
    card_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    template_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    kind: Mapped[str] = mapped_column(String(30), default="card_copy")
    # pending / running / success / failed
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    # 入参快照（渲染后的提示词 + 卡片字段）
    payload: Mapped[str] = mapped_column(Text, default="{}")
    # 出参：{"title": ..., "story": ..., "caption": ..., "tags": [...]}
    result: Mapped[str] = mapped_column(Text, default="{}")
    error: Mapped[str] = mapped_column(Text, default="")
    engine: Mapped[str] = mapped_column(String(40), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=local_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=local_now, onupdate=local_now)
