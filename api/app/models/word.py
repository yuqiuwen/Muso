"""词库：词典来源 + 词条。"""

from datetime import datetime

from sqlalchemy import Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseModel


class DictSource(BaseModel):
    __tablename__ = "dict_sources"

    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    filename: Mapped[str] = mapped_column(String(255), default="")
    entry_count: Mapped[int] = mapped_column(Integer, default=0)
    imported_at: Mapped[datetime] = mapped_column(default=datetime.now)


class Word(BaseModel):
    __tablename__ = "words"
    __table_args__ = (
        UniqueConstraint("word_key", "source", name="uq_words_word_key_source"),
        Index("ix_words_source", "source"),
        Index("ix_words_word_key", "word_key"),
    )

    word: Mapped[str] = mapped_column(String(200), nullable=False)
    # 归一化后的检索键（小写、去重音、去标点），唯一约束靠它
    word_key: Mapped[str] = mapped_column(String(200), nullable=False)
    phonetic_uk: Mapped[str] = mapped_column(String(120), default="")
    phonetic_us: Mapped[str] = mapped_column(String(120), default="")
    pos: Mapped[str] = mapped_column(String(120), default="")
    definition: Mapped[str] = mapped_column(Text, default="")
    # JSON 数组字符串：[{"en": "...", "zh": "..."}]
    examples: Mapped[str] = mapped_column(Text, default="[]")
    source: Mapped[str] = mapped_column(String(120), default="")
    raw: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(default=datetime.now)

    @property
    def phonetic(self) -> str:
        """兼容旧字段：优先美式，没有就回落英式。"""
        return self.phonetic_us or self.phonetic_uk
