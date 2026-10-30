"""领域常量。前端也维护了一份同名枚举（src/lib/constant.ts），改这里记得同步。"""

from enum import IntEnum, StrEnum


class CardModule(StrEnum):
    IMAGE = "image"
    VIDEO = "video"
    MUSIC = "music"


class CardStatus(StrEnum):
    DRAFT = "草稿"
    PENDING = "待发布"
    PUBLISHED = "已上架"
    OFFLINE = "已下架"


CARD_MODULES: dict[str, str] = {
    CardModule.IMAGE: "图文",
    CardModule.VIDEO: "视频",
    CardModule.MUSIC: "音乐",
}

CARD_STATUSES: dict[str, str] = {
    CardStatus.DRAFT: "#71717A",
    CardStatus.PENDING: "#B45309",
    CardStatus.PUBLISHED: "#15803D",
    CardStatus.OFFLINE: "#B91C1C",
}

CARD_TYPES: list[str] = [
    "英语单词卡片",
    "图文卡片",
    "视频脚本",
    "音乐卡片",
]


class PromptKind(IntEnum):
    """提示词模板类型。值同时是接口字段 `kind` 的取值，前端常量需同步。"""

    TEXT = 1
    IMAGE = 2
    OTHER = 3


PROMPT_KINDS: dict[int, str] = {
    PromptKind.TEXT: "文本",
    PromptKind.IMAGE: "生图",
    PromptKind.OTHER: "其他",
}
