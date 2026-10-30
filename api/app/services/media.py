"""图片存储：按卡片 id 分目录隔离。

目录布局（都在 `settings.IMAGE_DIR` 下）::

    storage/images/cards/<card_id>/<内容哈希>.<ext>   # 已归属某张卡片的配图
    storage/images/pending/<内容哈希>.<ext>           # 上传了但卡片还没保存的临时图
    storage/images/<散图>                             # 历史遗留，迁移脚本会搬进 cards/

对外一律通过 `/static` 访问，比如 `/static/images/cards/12/ab12cd34ef56.png`。
一张卡片的图全在一个目录里，删卡片可以直接整目录清掉，不会误伤别人。
"""

import hashlib
import shutil
from pathlib import Path

from fastapi import UploadFile

from app.config import settings
from app.core.app_code import AppCode
from app.core.exception import APIException
from app.utils.common import is_local_abs_path, to_local_path, to_static_url

ALLOWED_EXT = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"}
MAX_SIZE = 15 * 1024 * 1024  # 15 MB

# 卡片目录 / 未归属临时目录的目录名
CARD_DIR_NAME = "cards"
PENDING_DIR_NAME = "pending"


def card_dir(card_id: int | str) -> Path:
    """某张卡片的图片目录（磁盘绝对路径）。"""
    return settings.IMAGE_DIR / CARD_DIR_NAME / str(card_id)


def card_url(card_id: int | str, name: str) -> str:
    """某张卡片下某个文件的对外 URL。"""
    return f"{settings.STATIC_URL}/images/{CARD_DIR_NAME}/{card_id}/{name}"


def pending_dir() -> Path:
    return settings.IMAGE_DIR / PENDING_DIR_NAME


def _hash_name(content: bytes, suffix: str) -> str:
    """内容哈希命名：同一张图重复上传/导入只落一份。"""
    return f"{hashlib.sha1(content).hexdigest()[:16]}{suffix}"


class MediaService:
    def _target_dir(self, card_id: int | str | None) -> Path:
        return card_dir(card_id) if card_id else pending_dir()

    def _url_for(self, card_id: int | str | None, name: str) -> str:
        if card_id:
            return card_url(card_id, name)
        return f"{settings.STATIC_URL}/images/{PENDING_DIR_NAME}/{name}"

    def _write(self, content: bytes, suffix: str, card_id: int | str | None) -> str:
        """把字节写进目标目录，返回文件名（已存在则直接复用）。"""
        target_dir = self._target_dir(card_id)
        target_dir.mkdir(parents=True, exist_ok=True)
        name = _hash_name(content, suffix)
        target = target_dir / name
        if not target.exists():
            target.write_bytes(content)
        return name

    async def save_image(self, upload: UploadFile, card_id: int | None = None) -> dict:
        suffix = Path(upload.filename or "").suffix.lower()
        if suffix not in ALLOWED_EXT:
            raise APIException(
                f"不支持的图片格式 {suffix or '(未知)'}",
                code=AppCode.UPLOAD_FAIL,
                errmsg=f"只支持 {', '.join(sorted(ALLOWED_EXT))}",
            )

        content = await upload.read()
        if not content:
            raise APIException("空文件", code=AppCode.UPLOAD_FAIL, errmsg="上传的文件是空的")
        if len(content) > MAX_SIZE:
            raise APIException(
                "文件过大", code=AppCode.UPLOAD_FAIL, errmsg="单张图片不能超过 15 MB"
            )

        name = self._write(content, suffix, card_id)
        return {
            "name": upload.filename or name,
            "path": self._url_for(card_id, name),
            "size": len(content),
        }

    def save_bytes(
        self, content: bytes, suffix: str = ".png", card_id: int | None = None
    ) -> str:
        """脚本/迁移用：直接写字节，返回 /static 路径。"""
        return self._url_for(card_id, self._write(content, suffix, card_id))

    def import_local(self, paths: list[str], card_id: int | None = None) -> list[dict]:
        """把本机绝对路径的图片复制进 storage（有卡片就进卡片目录）。

        浏览器访问不到磁盘任意位置，`/Users/you/a.png` 会被当成站点下的相对
        地址直接 404，所以粘贴本地路径时先落一份副本，再按 /static 访问。
        文件名用内容哈希，同一个文件反复导入不会攒出多份。

        先整体校验再写盘，避免一半成功一半失败留下脏数据。
        """
        prepared: list[tuple[str, Path, bytes, str]] = []
        missing: list[str] = []

        for raw in paths:
            src = Path(to_local_path(raw))
            if not src.is_file():
                missing.append(str(src))
                continue

            suffix = src.suffix.lower()
            if suffix not in ALLOWED_EXT:
                raise APIException(
                    f"不支持的图片格式 {suffix or '(未知)'}",
                    code=AppCode.UPLOAD_FAIL,
                    errmsg=f"{src.name}：只支持 {', '.join(sorted(ALLOWED_EXT))}",
                )

            content = src.read_bytes()
            if not content:
                raise APIException(
                    "空文件", code=AppCode.UPLOAD_FAIL, errmsg=f"{src.name} 是空文件"
                )
            if len(content) > MAX_SIZE:
                raise APIException(
                    "文件过大", code=AppCode.UPLOAD_FAIL, errmsg=f"{src.name} 超过 15 MB"
                )
            prepared.append((raw, src, content, suffix))

        if missing:
            raise APIException(
                "本地图片不存在",
                code=AppCode.CARD_IMAGE_INVALID,
                errmsg="找不到这些文件：" + "、".join(missing),
            )

        out: list[dict] = []
        for raw, src, content, suffix in prepared:
            name = self._write(content, suffix, card_id)
            out.append(
                {
                    # source 是调用方传进来的原始字符串，方便前端把结果映射回去
                    "source": raw,
                    "name": src.name,
                    "path": self._url_for(card_id, name),
                    "local_path": str(self._target_dir(card_id) / name),
                    "size": len(content),
                }
            )
        return out

    def adopt(self, paths: list[str], card_id: int) -> list[str]:
        """把任意来源的配图归位到卡片自己的目录，返回最终 /static 路径。

        配图可能来自三个地方：上传（pending）、粘贴本机路径（还没落盘）、
        历史数据（`storage/images/xxx.png` 散图）。保存卡片时统一走这里搬进
        `cards/<card_id>/`，库里只留卡片目录下的路径。

        已经在卡片目录里的直接放行，所以重复保存是幂等的；外链不动；
        文件已经不在了的保留原路径（历史 404 不该阻塞保存）。
        """
        prefix = f"{settings.STATIC_URL}/images/{CARD_DIR_NAME}/{card_id}/"
        target_dir = card_dir(card_id)
        out: list[str] = []

        for raw in paths:
            path = raw
            if is_local_abs_path(path):
                path = self.import_local([path], card_id)[0]["path"]

            url = to_static_url(path)
            if url.startswith(("http://", "https://")) or url.startswith(prefix):
                out.append(url)
                continue

            src = Path(to_local_path(url))
            if not src.is_file():
                out.append(url)
                continue

            content = src.read_bytes()
            name = _hash_name(content, src.suffix.lower())
            target = target_dir / name
            if not target.exists():
                target_dir.mkdir(parents=True, exist_ok=True)
                target.write_bytes(content)
            out.append(card_url(card_id, name))

        return out

    def prune(self, card_id: int, keep: list[str]) -> int:
        """删掉卡片目录里已不再被引用的文件（换图、删图后留下的残渣）。"""
        target_dir = card_dir(card_id)
        if not target_dir.is_dir():
            return 0
        keep_names = {Path(to_local_path(p)).name for p in keep}
        removed = 0
        for item in target_dir.iterdir():
            if item.is_file() and item.name not in keep_names:
                item.unlink(missing_ok=True)
                removed += 1
        return removed

    def remove_card_dir(self, card_id: int) -> None:
        """删卡片时整目录清掉（配图只属于这张卡，不会牵连别人）。"""
        shutil.rmtree(card_dir(card_id), ignore_errors=True)


media_service = MediaService()
