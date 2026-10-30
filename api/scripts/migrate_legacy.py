"""把旧 Streamlit 版（learning-card-maker）的数据迁到 Muso 新库。

用法：
    uv run python scripts/migrate_legacy.py
    uv run python scripts/migrate_legacy.py --src /path/to/app.db --force

做的事：
1. 复制 data/images/* → storage/images/
2. dict_sources / words / sentence_sources / sentences / prompt_templates / cards / card_images
3. 旧字段归一化：phonetic 拆成 uk/us、images JSON 数组转 card_images、图片路径转 /static/images/xxx

源库用**只读短连接**按表读取（读完即关）：和 SQLAlchemy 的写连接长期并存时，
sqlite3 长连接出现过 schema 缓存错乱（读 words 报 no such column），这里刻意不共用连接。
"""

import argparse
import asyncio
import json
import shutil
import sqlite3
import sys
from collections.abc import Iterator
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import delete, func, select  # noqa: E402

from app.config import settings  # noqa: E402
from app.core.loggers import AppLogger, app_logger  # noqa: E402
from app.database import db as db_module  # noqa: E402
from app.database.init_db import init_db  # noqa: E402
from app.models import (  # noqa: E402
    Card,
    CardImage,
    DictSource,
    PromptTemplate,
    Sentence,
    SentenceSource,
    Word,
)
from app.services.media import media_service  # noqa: E402
from app.services.prompt import infer_kind  # noqa: E402
from app.utils.common import normalize_word_key, to_local_path  # noqa: E402

BATCH = 1000


def _connect_ro(src: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(f"file:{src}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    return conn


def read_table(src: Path, sql: str, batch: int = BATCH) -> Iterator[list[sqlite3.Row]]:
    conn = _connect_ro(src)
    try:
        cursor = conn.execute(sql)
        while True:
            rows = cursor.fetchmany(batch)
            if not rows:
                break
            yield list(rows)
    finally:
        conn.close()


def columns_of(src: Path, table: str) -> set[str]:
    conn = _connect_ro(src)
    try:
        return {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}
    finally:
        conn.close()


def _dt(value: str | None) -> datetime | None:
    if not value:
        return None
    for fmt in ("%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(value, fmt)
        except ValueError:
            continue
    return None


def copy_images(src_db: Path) -> int:
    src_dir = src_db.parent / "images"
    if not src_dir.exists():
        app_logger.warning(f"旧图片目录不存在: {src_dir}")
        return 0
    settings.IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    copied = 0
    for item in src_dir.iterdir():
        if not item.is_file():
            continue
        target = settings.IMAGE_DIR / item.name
        if not target.exists() or target.stat().st_size != item.stat().st_size:
            shutil.copy2(item, target)
            copied += 1
    return copied


def to_static(path: str) -> str:
    if not path:
        return ""
    if path.startswith(("/static/", "http://", "https://")):
        return path
    name = path.replace("\\", "/").rsplit("/", 1)[-1]
    return f"{settings.STATIC_URL}/images/{name}"


async def migrate(src: Path, force: bool) -> None:
    db_module.init_async_engine_and_session(settings.DB_MAIN_URL)
    await init_db()

    async with db_module.async_db_session() as session:
        existing = {
            "词条": (await session.execute(select(func.count(Word.id)))).scalar_one(),
            "词典": (await session.execute(select(func.count(DictSource.id)))).scalar_one(),
            "卡片": (await session.execute(select(func.count(Card.id)))).scalar_one(),
        }
        if any(existing.values()) and not force:
            app_logger.error(f"目标库已有数据 {existing}，加 --force 才会清空重迁")
            return
        if force:
            for model in (
                CardImage,
                Card,
                PromptTemplate,
                Sentence,
                SentenceSource,
                Word,
                DictSource,
            ):
                await session.execute(delete(model))
            await session.commit()
            app_logger.info("已清空目标库业务表")

        # ---------- 词典来源 ----------
        dict_rows = [r for chunk in read_table(src, "SELECT * FROM dict_sources ORDER BY id") for r in chunk]
        for row in dict_rows:
            session.add(
                DictSource(
                    name=row["name"],
                    filename=row["filename"] or "",
                    entry_count=row["entry_count"] or 0,
                    imported_at=_dt(row["imported_at"]) or datetime.now(),
                )
            )
        await session.commit()
        app_logger.info(f"词典来源 {len(dict_rows)} 条")

        # ---------- 词条 ----------
        cols = columns_of(src, "words")
        has_split = {"phonetic_uk", "phonetic_us"} <= cols
        sql = "SELECT word, word_key, phonetic, pos, definition, examples, source, raw, created_at"
        if has_split:
            sql += ", phonetic_uk, phonetic_us"
        sql += " FROM words"

        total = 0
        for chunk in read_table(src, sql):
            payload = []
            for row in chunk:
                legacy = (row["phonetic"] or "").strip()
                uk = (row["phonetic_uk"] or "").strip() if has_split else legacy
                us = (row["phonetic_us"] or "").strip() if has_split else ""
                payload.append(
                    {
                        "word": row["word"],
                        "word_key": row["word_key"] or normalize_word_key(row["word"]),
                        "phonetic_uk": uk,
                        "phonetic_us": us,
                        "pos": row["pos"] or "",
                        "definition": row["definition"] or "",
                        "examples": row["examples"] or "[]",
                        "source": row["source"] or "",
                        "raw": row["raw"] or "",
                        "created_at": _dt(row["created_at"]) or datetime.now(),
                    }
                )
            await session.execute(Word.__table__.insert(), payload)
            await session.commit()
            total += len(payload)
        app_logger.info(f"词条导入 {total} 条")

        # ---------- 句库 ----------
        sentence_sources = [
            r for chunk in read_table(src, "SELECT * FROM sentence_sources ORDER BY id") for r in chunk
        ]
        for row in sentence_sources:
            session.add(
                SentenceSource(
                    name=row["name"],
                    filename=row["filename"] or "",
                    entry_count=row["entry_count"] or 0,
                    imported_at=_dt(row["imported_at"]) or datetime.now(),
                )
            )
        await session.commit()

        total = 0
        for chunk in read_table(
            src, "SELECT en, zh, en_key, word_count, source, raw, created_at FROM sentences"
        ):
            payload = [
                {
                    "en": row["en"],
                    "zh": row["zh"] or "",
                    "en_key": row["en_key"],
                    "word_count": row["word_count"] or 0,
                    "source": row["source"] or "",
                    "raw": row["raw"] or "",
                    "created_at": _dt(row["created_at"]) or datetime.now(),
                }
                for row in chunk
            ]
            await session.execute(Sentence.__table__.insert(), payload)
            await session.commit()
            total += len(payload)
        app_logger.info(f"句库导入 {total} 条")

        # ---------- 提示词模板 ----------
        templates = [
            r for chunk in read_table(src, "SELECT * FROM prompt_templates ORDER BY id") for r in chunk
        ]
        for row in templates:
            session.add(
                PromptTemplate(
                    uid=row["id"],
                    name=row["name"],
                    description=row["description"] or "",
                    content=row["content"],
                    # 旧库没有类型字段，按名字前缀 + 内容特征推断
                    kind=infer_kind(row["name"], row["content"]),
                    builtin=bool(row["builtin"]),
                    created_at=_dt(row["created_at"]) or datetime.now(),
                    updated_at=_dt(row["updated_at"]) or datetime.now(),
                )
            )
        await session.commit()
        app_logger.info(f"模板导入 {len(templates)} 个")

        # ---------- 卡片 ----------
        card_cols = columns_of(src, "cards")
        cards = [r for chunk in read_table(src, "SELECT * FROM cards ORDER BY id") for r in chunk]
        created: list[Card] = []
        for row in cards:
            try:
                data = json.loads(row["card_data"] or "{}")
            except json.JSONDecodeError:
                data = {}
            if not isinstance(data, dict):
                data = {}

            images: list[str] = []
            if "images" in card_cols:
                try:
                    raw_images = json.loads(row["images"] or "[]")
                    if isinstance(raw_images, list):
                        images = [to_static(str(x)) for x in raw_images if str(x).strip()]
                except json.JSONDecodeError:
                    images = []
            if not images and row["image_path"]:
                images = [to_static(row["image_path"])]

            card = Card(
                module="image",
                status=row["status"] or "草稿",
                card_type=row["card_type"] or "英语单词卡片",
                theme=row["theme"] or "",
                title=row["title"],
                story=row["story"] or "",
                caption=row["caption"] or "",
                card_data=json.dumps(data, ensure_ascii=False),
                published_at=_dt(row["published_at"]),
                sort_order=int(row["id"]),
                created_at=_dt(row["created_at"]) or datetime.now(),
                updated_at=_dt(row["updated_at"]) or datetime.now(),
            )
            for index, path in enumerate(dict.fromkeys(images)):
                card.images.append(CardImage(path=path, position=index))
            session.add(card)
            created.append(card)

        await session.commit()

        # 配图按卡片归位：storage/images/cards/<card_id>/<hash>.png
        # copy_images 先把旧图平铺拷进 storage/images，这里再收进各自目录
        adopted = 0
        for card in created:
            for image in card.images:
                image.path = media_service.adopt([image.path], card.id)[0]
                adopted += 1
        await session.commit()
        app_logger.info(f"卡片导入 {len(created)} 张，配图归位 {adopted} 张")

        # 平铺的旧图已经被收进卡片目录，根目录剩的都是没人引用的，清掉
        removed = purge_flat_images(session)
        app_logger.info(f"清理未引用散图 {removed} 张")


async def purge_flat_images(session) -> int:
    """删掉 `storage/images/` 根目录下没有任何卡片引用的文件。"""
    referenced = {
        Path(to_local_path(row[0])).resolve()
        for row in (await session.execute(select(CardImage.path))).all()
    }
    removed = 0
    for item in settings.IMAGE_DIR.iterdir():
        if item.is_file() and item.resolve() not in referenced:
            item.unlink(missing_ok=True)
            removed += 1
    return removed


def main() -> None:
    parser = argparse.ArgumentParser(description="迁移旧版学习卡片数据到 Muso")
    parser.add_argument(
        "--src",
        default="/Users/qw/Projects/python/learning-card-maker/data/app.db",
        help="旧项目 sqlite 路径",
    )
    parser.add_argument("--force", action="store_true", help="清空目标库业务表后重迁")
    args = parser.parse_args()

    AppLogger.init()
    src = Path(args.src).expanduser().resolve()
    if not src.exists():
        raise SystemExit(f"找不到源库: {src}")

    copied = copy_images(src)
    app_logger.info(f"图片拷贝 {copied} 张 → {settings.IMAGE_DIR}")

    asyncio.run(migrate(src, args.force))
    app_logger.info("迁移完成 ✅")


if __name__ == "__main__":
    main()
