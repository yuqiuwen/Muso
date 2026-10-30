"""内容卡片服务：多图排序、状态流转、JSON 批量导入。"""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.constant import CARD_MODULES, CardStatus
from app.core.app_code import AppCode
from app.core.exception import APIException, NotFoundError, ValidateError
from app.models.base import local_now
from app.models.card import Card, CardImage
from app.repo.card import card_repo
from app.schemas.card import (
    CardDetail,
    CardImageItem,
    CardImportResult,
    CardItem,
    CardSavePayload,
)
from app.services.media import media_service
from app.utils.common import (
    is_local_abs_path,
    normalize_images,
    split_words,
    to_local_path,
    to_static_url,
)

# JSON 导入的字段别名（英文 + 中文），和旧版导入器保持一致
FIELD_ALIASES: dict[str, tuple[str, ...]] = {
    "title": ("title", "标题"),
    "status": ("status", "状态"),
    "card_type": ("card_type", "cardType", "type", "类型"),
    "module": ("module", "模块"),
    "theme": ("theme", "场景", "场景主题", "主题"),
    "words": ("words", "单词", "单词列表", "词汇"),
    "story": ("story", "故事", "故事描述", "故事场景描述"),
    "content": ("content", "caption", "正文", "配文", "文案"),
    "images": ("images", "image_path", "imagePath", "配图", "图片", "图片列表", "配图列表"),
    "card_data": ("card_data", "cardData", "data", "卡片数据"),
}


def _pick(raw: dict, key: str, default: Any = None) -> Any:
    for alias in FIELD_ALIASES.get(key, (key,)):
        if alias in raw and raw[alias] not in (None, ""):
            return raw[alias]
    return default


def _parse_paths(value: Any) -> list[str]:
    """配图字段：数组、逗号分隔、换行分隔都认。"""
    if value is None:
        return []
    if isinstance(value, list):
        return [str(x).strip() for x in value if str(x).strip()]
    return [x.strip() for x in str(value).replace("\n", ",").split(",") if x.strip()]


def _card_data(card: Card) -> dict:
    try:
        data = json.loads(card.card_data or "{}")
    except json.JSONDecodeError:
        return {}
    return data if isinstance(data, dict) else {}


def _image_items(card: Card) -> list[CardImageItem]:
    rows = sorted(card.images or [], key=lambda x: x.position)
    return [
        CardImageItem(
            id=row.id,
            path=row.path,
            url=to_static_url(row.path),
            local_path=to_local_path(row.path),
            position=row.position,
            caption=row.caption or "",
        )
        for row in rows
    ]


def to_item(card: Card) -> CardItem:
    images = _image_items(card)
    data = _card_data(card)
    return CardItem(
        id=card.id,
        module=card.module or "image",
        status=card.status,
        card_type=card.card_type,
        theme=card.theme or "",
        title=card.title,
        caption=card.caption or "",
        cover=images[0].url if images else "",
        image_count=len(images),
        words=split_words(data.get("words") or []),
        is_pinned=bool(card.is_pinned),
        created_at=card.created_at,
        updated_at=card.updated_at,
        published_at=card.published_at,
    )


def to_detail(card: Card) -> CardDetail:
    base = to_item(card).model_dump()
    return CardDetail(
        **base,
        story=card.story or "",
        images=_image_items(card),
        card_data=_card_data(card),
    )


def _resolve_images(paths: list[str], card_id: int) -> list[str]:
    """配图归位：去空去重 → 本机绝对路径导入 → 统一搬进 `cards/<card_id>/`。

    浏览器只能访问 `/static` 下的文件，`/Users/you/a.png` 会被解析成站点下的
    相对地址直接 404，所以本地路径要先复制进 storage；随后 `adopt` 把它们和
    历史散图一起收进卡片自己的目录，库里只留 `/static/images/cards/<id>/x.png`。
    """
    return media_service.adopt(normalize_images(paths), card_id)


def _check_count(paths: list[str]) -> None:
    # 先卡数量再落盘，避免超限时白拷一堆文件
    if len([p for p in paths if str(p).strip()]) > settings.MAX_CARD_IMAGES:
        raise APIException(
            f"最多 {settings.MAX_CARD_IMAGES} 张配图",
            code=AppCode.CARD_IMAGE_LIMIT,
            errmsg=f"最多 {settings.MAX_CARD_IMAGES} 张配图，请先删掉几张",
        )


class CardService:
    async def list(self, session: AsyncSession, **kwargs) -> tuple[list[CardItem], int]:
        rows, total = await card_repo.list(session, **kwargs)
        return [to_item(r) for r in rows], total

    async def get_model(self, session: AsyncSession, card_id: int) -> Card:
        card = await card_repo.get(session, card_id)
        if not card:
            raise NotFoundError("卡片不存在", code=AppCode.CARD_NOT_FOUND)
        return card

    async def get(self, session: AsyncSession, card_id: int) -> CardDetail:
        card = await self.get_model(session, card_id)
        await self._repair_local_images(session, card)
        return to_detail(card)

    async def _repair_local_images(self, session: AsyncSession, card: Card) -> None:
        """自愈：把历史数据里存成绝对路径的配图补一次导入。

        这类行是「粘贴本地路径但没走导入」留下的，直接访问会一直 404。
        只在读到绝对路径时才动手，正常数据零开销。
        """
        changed = False
        for row in card.images or []:
            if not is_local_abs_path(row.path):
                continue
            try:
                row.path = _resolve_images([row.path], card.id)[0]
            except APIException:
                continue  # 文件已被删掉就保持原样，不阻塞详情读取
            changed = True
        if changed:
            await card_repo.save(session, card)

    async def create(self, session: AsyncSession, data: CardSavePayload) -> CardDetail:
        if data.module not in CARD_MODULES:
            raise ValidateError(f"未知模块 {data.module}")
        if data.status not in {s.value for s in CardStatus}:
            raise ValidateError(f"未知状态 {data.status}")

        paths = data.images or []
        _check_count(paths)

        card = Card(
            module=data.module,
            status=data.status,
            card_type=data.card_type or "图文卡片",
            theme=data.theme.strip(),
            title=data.title.strip(),
            story=data.story.strip(),
            caption=data.caption.strip(),
            card_data=json.dumps(
                {**(data.card_data or {}), "words": data.words}, ensure_ascii=False
            ),
            sort_order=await card_repo.max_sort(session) + 1,
            published_at=local_now() if data.status == CardStatus.PUBLISHED else None,
        )
        # 先落库拿到 id：配图目录是 cards/<id>/，没有 id 不知道该往哪放
        await card_repo.add(session, card)

        for index, path in enumerate(_resolve_images(paths, card.id)):
            card.images.append(CardImage(path=path, position=index))

        await card_repo.save(session, card)
        return to_detail(card)

    async def update(
        self, session: AsyncSession, card_id: int, data: CardSavePayload
    ) -> CardDetail:
        card = await self.get_model(session, card_id)

        card.title = data.title.strip()
        card.module = data.module if data.module in CARD_MODULES else card.module
        card.card_type = data.card_type or card.card_type
        card.theme = data.theme.strip()
        card.story = data.story.strip()
        card.caption = data.caption.strip()
        card.card_data = json.dumps(
            {**(data.card_data or {}), "words": data.words}, ensure_ascii=False
        )

        if data.status != card.status:
            card.status = data.status
            if data.status == CardStatus.PUBLISHED and not card.published_at:
                card.published_at = local_now()

        # images=None 表示不动；空数组才是清空。
        # 这条规则让「AI 只回填一个主图」不会把已有整套图冲掉。
        paths: list[str] | None = None
        if data.images is not None:
            _check_count(data.images)
            paths = _resolve_images(data.images, card.id)
            card.images.clear()
            for index, path in enumerate(paths):
                card.images.append(CardImage(path=path, position=index))

        await card_repo.save(session, card)
        # 提交成功后再清残渣，避免保存失败把图删了却回滚不了
        if paths is not None:
            media_service.prune(card.id, paths)
        return to_detail(card)

    async def delete(self, session: AsyncSession, card_id: int) -> bool:
        card = await self.get_model(session, card_id)
        await card_repo.delete(session, card)
        # 配图按卡片目录隔离，删卡片顺手把整个目录清掉
        media_service.remove_card_dir(card_id)
        return True

    async def append_images(
        self, session: AsyncSession, card_id: int, paths: list[str]
    ) -> CardDetail:
        card = await self.get_model(session, card_id)
        existing = [i.path for i in sorted(card.images, key=lambda x: x.position)]
        if len([p for p in existing + paths if str(p).strip()]) > settings.MAX_CARD_IMAGES:
            raise APIException(
                f"最多 {settings.MAX_CARD_IMAGES} 张配图",
                code=AppCode.CARD_IMAGE_LIMIT,
                errmsg=f"最多 {settings.MAX_CARD_IMAGES} 张配图，已忽略超出的图片",
            )
        merged = normalize_images(existing + _resolve_images(paths, card.id))
        self._reorder(card, merged)
        await card_repo.save(session, card)
        media_service.prune(card.id, merged)
        return to_detail(card)

    async def reorder_images(
        self, session: AsyncSession, card_id: int, paths: list[str]
    ) -> CardDetail:
        card = await self.get_model(session, card_id)
        existing = [i.path for i in sorted(card.images, key=lambda x: x.position)]
        if sorted(existing) != sorted(paths):
            raise ValidateError("配图列表和现有图片不一致，请刷新后重试")
        self._reorder(card, paths)
        await card_repo.save(session, card)
        return to_detail(card)

    async def remove_image(
        self, session: AsyncSession, card_id: int, image_id: int
    ) -> CardDetail:
        card = await self.get_model(session, card_id)
        target = next((i for i in card.images if i.id == image_id), None)
        if not target:
            raise NotFoundError("配图不存在", code=AppCode.CARD_IMAGE_INVALID)
        card.images.remove(target)
        keep = [i.path for i in sorted(card.images, key=lambda x: x.position)]
        self._reorder(card, keep)
        await card_repo.save(session, card)
        media_service.prune(card.id, keep)
        return to_detail(card)

    @staticmethod
    def _reorder(card: Card, paths: list[str]) -> None:
        """按 paths 顺序重建 position；CardImage 复用已有对象，避免 id 变化。"""
        by_path = {i.path: i for i in card.images}
        ordered: list[CardImage] = []
        for index, path in enumerate(paths):
            row = by_path.get(path) or CardImage(path=path)
            row.position = index
            ordered.append(row)
        card.images = ordered

    async def set_status(self, session: AsyncSession, card_id: int, status: str) -> CardItem:
        if status not in {s.value for s in CardStatus}:
            raise ValidateError(f"未知状态 {status}")
        card = await self.get_model(session, card_id)
        card.status = status
        if status == CardStatus.PUBLISHED and not card.published_at:
            card.published_at = local_now()
        await card_repo.save(session, card)
        return to_item(card)

    async def toggle_pin(self, session: AsyncSession, card_id: int) -> CardItem:
        card = await self.get_model(session, card_id)
        card.is_pinned = not card.is_pinned
        await card_repo.save(session, card)
        return to_item(card)

    async def themes(self, session: AsyncSession, module: str = "image") -> list[str]:
        return await card_repo.themes(session, module)

    # ---------------- JSON 批量导入 ----------------

    def parse_payloads(self, text: str) -> tuple[list[dict], list[str]]:
        try:
            raw = json.loads(text)
        except json.JSONDecodeError as exc:
            return [], [f"JSON 解析失败：{exc.msg}（第 {exc.lineno} 行）"]

        rows = raw if isinstance(raw, list) else [raw]
        payloads: list[dict] = []
        errors: list[str] = []

        for index, item in enumerate(rows, start=1):
            if not isinstance(item, dict):
                errors.append(f"第 {index} 条不是对象，已跳过")
                continue
            title = str(_pick(item, "title", "") or "").strip()
            if not title:
                errors.append(f"第 {index} 条缺少 title / 标题，已跳过")
                continue

            data = _pick(item, "card_data", {}) or {}
            if not isinstance(data, dict):
                data = {}

            status = str(_pick(item, "status", CardStatus.DRAFT) or CardStatus.DRAFT).strip()
            if status not in {s.value for s in CardStatus}:
                errors.append(f"第 {index} 条状态「{status}」不认识，按草稿处理")
                status = CardStatus.DRAFT

            module = str(_pick(item, "module", "image") or "image").strip()
            if module not in CARD_MODULES:
                errors.append(f"第 {index} 条模块「{module}」不认识，按图文处理")
                module = "image"

            payloads.append(
                {
                    "title": title,
                    "status": status,
                    "module": module,
                    "card_type": str(_pick(item, "card_type", "图文卡片") or "图文卡片"),
                    "theme": str(_pick(item, "theme", "") or "").strip(),
                    "words": split_words(_pick(item, "words", [])),
                    "story": str(_pick(item, "story", "") or "").strip(),
                    "caption": str(_pick(item, "content", "") or "").strip(),
                    "images": _parse_paths(_pick(item, "images", None)),
                    "card_data": data,
                }
            )

        return payloads, errors

    async def import_json(self, session: AsyncSession, text: str) -> CardImportResult:
        payloads, errors = self.parse_payloads(text)
        created: list[int] = []
        for payload in payloads:
            try:
                card = await self.create(session, CardSavePayload(**payload))
                created.append(card.id)
            except APIException as exc:
                errors.append(f"「{payload['title']}」导入失败：{exc.errmsg or exc.message}")
        return CardImportResult(created=created, errors=errors)

    async def count(self, session: AsyncSession) -> int:
        return await card_repo.count(session)


card_service = CardService()
