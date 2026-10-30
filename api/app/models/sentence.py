"""句库：双语例句。"""

from datetime import datetime

from sqlalchemy import Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseModel


class SentenceSource(BaseModel):
    __tablename__ = "sentence_sources"

    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    filename: Mapped[str] = mapped_column(String(255), default="")
    entry_count: Mapped[int] = mapped_column(Integer, default=0)
    imported_at: Mapped[datetime] = mapped_column(default=datetime.now)


class Sentence(BaseModel):
    __tablename__ = "sentences"
    __table_args__ = (
        UniqueConstraint("en_key", "source", name="uq_sentences_en_key_source"),
        Index("ix_sentences_en_key", "en_key"),
        Index("ix_sentences_word_count", "word_count"),
    )

    en: Mapped[str] = mapped_column(Text, nullable=False)
    zh: Mapped[str] = mapped_column(Text, default="")
    # 首尾带空格的小写英文，配合 LIKE '% key %' 做整词匹配
    en_key: Mapped[str] = mapped_column(Text, nullable=False)
    word_count: Mapped[int] = mapped_column(Integer, default=0)
    source: Mapped[str] = mapped_column(String(120), default="")
    raw: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(default=datetime.now)
