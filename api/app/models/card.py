"""内容卡片：图文 / 视频 / 音乐三个模块共用一张表，用 `module` 区分。"""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel, TimeModel


class Card(TimeModel, BaseModel):
    __tablename__ = "cards"
    __table_args__ = (
        Index("ix_cards_module_status", "module", "status"),
        Index("ix_cards_sort", "sort_order"),
    )

    # image=图文 / video=视频 / music=音乐
    module: Mapped[str] = mapped_column(String(20), default="image", nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="草稿", nullable=False)
    card_type: Mapped[str] = mapped_column(String(60), default="图文卡片")
    theme: Mapped[str] = mapped_column(String(120), default="")
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    # 故事场景描述：喂给生图 / 生视频提示词
    story: Mapped[str] = mapped_column(Text, default="")
    # 配文：发布文案
    caption: Mapped[str] = mapped_column(Text, default="")
    # 卡片数据：{"words": [...], "prompt": "...", ...}
    card_data: Mapped[str] = mapped_column(Text, default="{}")
    published_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # 列表排序（越大越靠前），同值按 id 倒序
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_pinned: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    images: Mapped[list["CardImage"]] = relationship(
        back_populates="card",
        cascade="all, delete-orphan",
        order_by="CardImage.position",
        lazy="selectin",
    )


class CardImage(BaseModel):
    __tablename__ = "card_images"
    __table_args__ = (Index("ix_card_images_card", "card_id", "position"),)

    card_id: Mapped[int] = mapped_column(
        ForeignKey("cards.id", ondelete="CASCADE"), nullable=False
    )
    path: Mapped[str] = mapped_column(String(500), nullable=False)
    # 顺序即展示顺序，position=0 是主图
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    caption: Mapped[str] = mapped_column(String(255), default="")
    created_at: Mapped[datetime] = mapped_column(default=datetime.now)

    card: Mapped[Card] = relationship(back_populates="images")
