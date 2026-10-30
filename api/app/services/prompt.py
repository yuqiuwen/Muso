"""提示词模板：槽位解析、字段映射、渲染。

和旧实现保持一致：槽位写 `{{单词列表}}` / `{{story}}`，中文英文槽位都认。
"""

from __future__ import annotations

import re

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.constant import PromptKind
from app.core.app_code import AppCode
from app.core.exception import APIException, NotFoundError
from app.models.prompt import PromptTemplate
from app.repo.prompt import prompt_repo
from app.schemas.prompt import TemplateItem, TemplateSavePayload
from app.utils.common import gen_uid

SLOT_RE = re.compile(r"\{\{\s*([^{}\n]+?)\s*\}\}")

# 槽位 → 卡片字段。英文槽位直接就是字段名，中文是历史模板的写法。
SLOT_FIELD_MAP: dict[str, str] = {
    "title": "title",
    "标题": "title",
    "theme": "theme",
    "场景主题": "theme",
    "主题场景": "theme",
    "场景": "theme",
    "主题": "theme",
    "story": "story",
    "故事场景描述": "story",
    "故事描述": "story",
    "故事": "story",
    "画面故事": "story",
    "words": "words",
    "词汇列表": "words",
    "单词列表": "words",
    "单词": "words",
    "content": "content",
    "配文": "content",
    "正文": "content",
    "文案": "content",
    "dictionary": "dictionary",
    "词库数据": "dictionary",
    "词汇数据": "dictionary",
    "style": "style",
    "画面风格": "style",
}


def slot_field(slot: str) -> str | None:
    key = (slot or "").strip()
    return SLOT_FIELD_MAP.get(key) or SLOT_FIELD_MAP.get(key.lower())


# 判断历史模板是生图还是文本用的关键词。旧库没有 kind 字段，只能靠名字前缀 + 内容特征猜。
_IMAGE_HINTS = (
    "生成一张",
    "生成一幅",
    "请画",
    "绘制",
    "插画",
    "海报",
    "摄影",
    "构图",
    "画面",
    "配色",
)


def infer_kind(name: str, content: str) -> int:
    """推断模板类型：名字前缀优先，其次看内容里有没有生图词汇。"""
    title = name or ""
    if "生图" in title:
        return PromptKind.IMAGE
    if "文本" in title:
        return PromptKind.TEXT
    if "待定" in title:
        return PromptKind.OTHER
    return PromptKind.IMAGE if any(h in (content or "") for h in _IMAGE_HINTS) else PromptKind.TEXT


def extract_slots(content: str) -> list[str]:
    slots: list[str] = []
    for match in SLOT_RE.finditer(content or ""):
        name = match.group(1).strip()
        if name and name not in slots:
            slots.append(name)
    return slots


def render(content: str, values: dict[str, str]) -> str:
    def repl(match: re.Match) -> str:
        name = match.group(1).strip()
        return str(values.get(name, "")).strip() or f"（{name}）"

    return SLOT_RE.sub(repl, content or "")


def render_for_fields(content: str, fields: dict[str, object]) -> tuple[str, list[str]]:
    values: dict[str, str] = {}
    missing: list[str] = []
    for slot in extract_slots(content):
        field = slot_field(slot)
        raw = fields.get(field, "") if field else ""
        if isinstance(raw, (list, tuple)):
            text = ", ".join(str(x).strip() for x in raw if str(x).strip())
        else:
            text = str(raw or "").strip()
        values[slot] = text
        if not text:
            missing.append(slot)
    return render(content, values), missing


def to_item(tpl: PromptTemplate) -> TemplateItem:
    return TemplateItem(
        id=tpl.uid,
        name=tpl.name,
        description=tpl.description or "",
        content=tpl.content,
        kind=tpl.kind or PromptKind.TEXT,
        builtin=tpl.builtin,
        created_at=tpl.created_at,
        updated_at=tpl.updated_at,
        slots=extract_slots(tpl.content),
        chars=len(tpl.content),
    )


class PromptService:
    async def list(self, session: AsyncSession) -> list[TemplateItem]:
        return [to_item(t) for t in await prompt_repo.list(session)]

    async def get_model(self, session: AsyncSession, uid: str) -> PromptTemplate:
        tpl = await prompt_repo.get(session, uid)
        if not tpl:
            raise NotFoundError("模板不存在", code=AppCode.TEMPLATE_NOT_FOUND)
        return tpl

    async def get(self, session: AsyncSession, uid: str) -> TemplateItem:
        return to_item(await self.get_model(session, uid))

    async def create(self, session: AsyncSession, data: TemplateSavePayload) -> TemplateItem:
        tpl = PromptTemplate(
            uid=gen_uid(),
            name=data.name.strip(),
            description=data.description.strip(),
            content=data.content,
            kind=data.kind,
            builtin=False,
        )
        await prompt_repo.add(session, tpl)
        return to_item(tpl)

    async def update(
        self, session: AsyncSession, uid: str, data: TemplateSavePayload
    ) -> TemplateItem:
        tpl = await self.get_model(session, uid)
        tpl.name = data.name.strip()
        tpl.description = data.description.strip()
        tpl.content = data.content
        tpl.kind = data.kind
        await prompt_repo.add(session, tpl)
        return to_item(tpl)

    async def delete(self, session: AsyncSession, uid: str) -> bool:
        tpl = await self.get_model(session, uid)
        if tpl.builtin:
            raise APIException(
                "内置模板不可删除", code=AppCode.TEMPLATE_BUILTIN_LOCKED, errmsg="内置模板不可删除"
            )
        await prompt_repo.delete(session, tpl)
        return True

    async def duplicate(self, session: AsyncSession, uid: str) -> TemplateItem:
        tpl = await self.get_model(session, uid)
        clone = PromptTemplate(
            uid=gen_uid(),
            name=f"{tpl.name} 副本",
            description=tpl.description or "",
            content=tpl.content,
            kind=tpl.kind,
            builtin=False,
        )
        await prompt_repo.add(session, clone)
        return to_item(clone)

    async def render(
        self, session: AsyncSession, uid: str, fields: dict[str, object]
    ) -> tuple[str, list[str]]:
        tpl = await self.get_model(session, uid)
        return render_for_fields(tpl.content, fields)

    @property
    def max_chars(self) -> int:
        return settings.MAX_TEMPLATE_CHARS


prompt_service = PromptService()
