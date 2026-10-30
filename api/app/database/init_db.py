"""建表 + 轻量迁移。

项目规模不需要 alembic：`create_all` 建缺失的表，`_migrate` 给已存在的表补列。
补列只做「加列」这种幂等操作，改类型/删列仍然要手写脚本。
"""

from sqlalchemy import text

from app.core.loggers import app_logger
from app.database import db as db_module
from app.models import Base

# 表名 -> [(列名, 列定义)]
_EXPECTED_COLUMNS: dict[str, list[tuple[str, str]]] = {
    "cards": [
        ("module", "VARCHAR(20) NOT NULL DEFAULT 'image'"),
        ("sort_order", "INTEGER NOT NULL DEFAULT 0"),
        ("is_pinned", "BOOLEAN NOT NULL DEFAULT 0"),
    ],
    "words": [
        ("phonetic_uk", "VARCHAR(120) DEFAULT ''"),
        ("phonetic_us", "VARCHAR(120) DEFAULT ''"),
    ],
    "prompt_templates": [
        ("kind", "INTEGER NOT NULL DEFAULT 1"),
    ],
}

# 加列后要按历史数据回填的表列：只有「本次真的新增了这一列」才跑，避免覆盖用户后来改的值
_BACKFILL_COLUMNS = {("prompt_templates", "kind")}


async def _backfill(conn, table: str, column: str) -> None:
    if (table, column) not in _BACKFILL_COLUMNS:
        return
    # 函数内导入：services 依赖 repo/database，放顶层会把启动链绕成环
    from app.services.prompt import infer_kind

    rows = (
        await conn.execute(text(f"SELECT id, name, content FROM {table}"))  # noqa: S608
    ).fetchall()
    for row in rows:
        kind = infer_kind(row[1] or "", row[2] or "")
        if kind != 1:
            await conn.execute(
                text(f"UPDATE {table} SET {column} = :kind WHERE id = :id"),  # noqa: S608
                {"kind": kind, "id": row[0]},
            )


async def _migrate(conn) -> None:
    for table, columns in _EXPECTED_COLUMNS.items():
        rows = await conn.execute(text(f"PRAGMA table_info({table})"))
        existing = {row[1] for row in rows.fetchall()}
        if not existing:
            continue
        for name, ddl in columns:
            if name not in existing:
                await conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}"))
                app_logger.info(f"迁移：{table} 新增列 {name}")
                await _backfill(conn, table, name)


async def init_db() -> None:
    # 必须走模块属性：engine 是运行时才绑定的全局，导入期拿到的会是 None
    if db_module.async_engine is None:
        raise RuntimeError("数据库引擎未初始化")

    async with db_module.async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await _migrate(conn)

    app_logger.info(f"数据库表就绪: {', '.join(sorted(Base.metadata.tables))}")
