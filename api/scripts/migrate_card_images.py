"""把历史扁平存放的配图搬进「每张卡片一个目录」。

    storage/images/xxx.png              → storage/images/cards/<card_id>/<hash>.png
    /static/images/xxx.png (card_images) → /static/images/cards/<card_id>/<hash>.png

用法::

    uv run python scripts/migrate_card_images.py              # 预演，只打印不落盘
    uv run python scripts/migrate_card_images.py --apply      # 真搬文件 + 写库
    uv run python scripts/migrate_card_images.py --apply --purge-orphans

同一张图被多张卡片引用时，第一张用搬（move），其余用复制，谁也不丢。
搬完之后 `storage/images/` 根目录剩下的都是没人引用的散图，默认只统计，
加 `--purge-orphans` 才会删。
"""

import argparse
import hashlib
import shutil
import sqlite3
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import settings  # noqa: E402
from app.services.media import CARD_DIR_NAME, card_dir, card_url  # noqa: E402
from app.utils.common import to_local_path  # noqa: E402

CARD_PREFIX = f"{settings.STATIC_URL}/images/{CARD_DIR_NAME}/"


def db_path() -> Path:
    raw = settings.DB_MAIN_URL.split("///", 1)[-1]
    path = Path(raw)
    return path if path.is_absolute() else (settings.BASE_DIR / path).resolve()


def already_migrated(path: str, card_id: int) -> bool:
    return path.startswith(f"{CARD_PREFIX}{card_id}/")


def plan(rows: list[tuple[int, int, str]]) -> list[dict]:
    """把「行」翻译成「搬运任务」，同一源文件被多张卡片引用时共用一份内容。"""
    tasks: list[dict] = []
    for row_id, card_id, path in rows:
        if not path or path.startswith(("http://", "https://")):
            continue
        if already_migrated(path, card_id):
            continue
        tasks.append({"row_id": row_id, "card_id": card_id, "path": path})
    return tasks


def main() -> None:
    parser = argparse.ArgumentParser(description="配图迁移到按卡片分目录")
    parser.add_argument("--apply", action="store_true", help="真的搬文件并写库（默认只预演）")
    parser.add_argument("--purge-orphans", action="store_true", help="顺手删掉没人引用的散图")
    args = parser.parse_args()

    db = db_path()
    if not db.exists():
        raise SystemExit(f"找不到数据库: {db}")

    conn = sqlite3.connect(db)
    conn.row_factory = sqlite3.Row
    rows = [
        (r["id"], r["card_id"], r["path"])
        for r in conn.execute("SELECT id, card_id, path FROM card_images ORDER BY card_id, position, id")
    ]
    tasks = plan(rows)
    print(f"库: {db}")
    print(f"配图记录 {len(rows)} 条，待迁移 {len(tasks)} 条，已在新结构 {len(rows) - len(tasks)} 条")

    # 源文件 → 任务列表，判断哪些文件被多张卡片共享
    by_source: dict[str, list[dict]] = defaultdict(list)
    missing: list[str] = []
    for task in tasks:
        src = Path(to_local_path(task["path"]))
        if not src.is_file():
            missing.append(f"#{task['row_id']} {task['path']}")
            continue
        by_source[str(src)].append(task)

    if missing:
        print(f"\n⚠️  {len(missing)} 条记录指向的文件不存在，保持原样：")
        for line in missing[:10]:
            print(f"   {line}")
        if len(missing) > 10:
            print(f"   … 还有 {len(missing) - 10} 条")

    updates: list[tuple[str, int]] = []
    moved = copied = 0
    for src_raw, items in by_source.items():
        src = Path(src_raw)
        content = src.read_bytes()
        name = f"{hashlib.sha1(content).hexdigest()[:16]}{src.suffix.lower()}"
        first_dest: Path | None = None

        for task in items:
            dest = card_dir(task["card_id"]) / name
            if not args.apply:
                updates.append((card_url(task["card_id"], name), task["row_id"]))
                first_dest = first_dest or dest
                continue

            dest.parent.mkdir(parents=True, exist_ok=True)
            if first_dest is None:
                if dest.exists():
                    dest.unlink()
                shutil.move(str(src), str(dest))
                first_dest = dest
                moved += 1
            elif not dest.exists():
                shutil.copy2(first_dest, dest)
                copied += 1
            updates.append((card_url(task["card_id"], name), task["row_id"]))

    print(f"\n文件：搬 {moved if args.apply else len(by_source)} 份"
          f"，复制 {copied if args.apply else max(len(tasks) - len(by_source), 0)} 份")
    print(f"数据库：更新 {len(updates)} 条 card_images.path")

    if not args.apply:
        print("\n预演模式，未改动任何文件。确认无误后加 --apply 执行。")
        conn.close()
        return

    conn.executemany("UPDATE card_images SET path = ? WHERE id = ?", updates)
    conn.commit()

    # 搬完后根目录剩下的散图都是没人引用的
    referenced = {
        Path(to_local_path(r["path"])) for r in conn.execute("SELECT path FROM card_images")
    }
    orphans = [
        item for item in settings.IMAGE_DIR.iterdir() if item.is_file() and item.resolve() not in referenced
    ]
    print(f"根目录剩余散图 {len(orphans)} 张（未被任何卡片引用）")
    if args.purge_orphans:
        for item in orphans:
            item.unlink()
        print(f"已删除 {len(orphans)} 张散图")
    elif orphans:
        print("加 --purge-orphans 可清理")

    conn.close()
    print("迁移完成 ✅")


if __name__ == "__main__":
    main()
