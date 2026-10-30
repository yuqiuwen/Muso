"""模型汇总导入：`Base.metadata` 要能看到所有表，create_all 才会建全。"""

from app.models.base import Base, BaseModel, TimeModel, local_now
from app.models.card import Card, CardImage
from app.models.generation import GenerationTask
from app.models.prompt import PromptTemplate
from app.models.sentence import Sentence, SentenceSource
from app.models.word import DictSource, Word

__all__ = [
    "Base",
    "BaseModel",
    "TimeModel",
    "local_now",
    "Card",
    "CardImage",
    "GenerationTask",
    "PromptTemplate",
    "Sentence",
    "SentenceSource",
    "DictSource",
    "Word",
]
