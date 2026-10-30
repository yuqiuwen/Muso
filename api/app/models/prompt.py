"""提示词模板。

`content` 里用 `{{槽位名}}` 占位，槽位到卡片字段的映射在 services/prompt.py。
"""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseModel, local_now


class PromptTemplate(BaseModel):
    __tablename__ = "prompt_templates"

    # 业务 id：内置模板用 builtin-xxx，自建模板用 12 位随机 hex
    uid: Mapped[str] = mapped_column(String(40), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(String(255), default="")
    content: Mapped[str] = mapped_column(Text, nullable=False)
    # 模板类型：1 文本 / 2 生图 / 3 其他
    kind: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    builtin: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=local_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=local_now, onupdate=local_now
    )
