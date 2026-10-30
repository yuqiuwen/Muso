"""通用小工具：id、文本归一化、图片列表清洗。"""

import re
import unicodedata
import uuid
from pathlib import Path
from urllib.parse import unquote

from app.config import settings

_QUOTE_PAIRS = [("“", "”"), ("‘", "’"), ('"', '"'), ("'", "'")]
_WORD_SPLIT_RE = re.compile(r"[,，;；\n\r\t]+")
# Windows 盘符路径（`C:\a\b.png`）。POSIX 下 Path.is_absolute() 认不出来，单独判一次
_WIN_ABS_RE = re.compile(r"^[A-Za-z]:[\\/]")


def gen_uid(length: int = 12) -> str:
    return uuid.uuid4().hex[:length]


def normalize_word_key(word: str) -> str:
    """检索键：小写、去重音、压空白。中英混排也适用。"""
    text = unicodedata.normalize("NFKD", (word or "").strip().lower())
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return re.sub(r"\s+", " ", text)


_SPACE_RE = re.compile(r"\s+")


def sentence_key(en: str) -> str:
    """句库整词键：小写 + 去标点 + 首尾空格，配合 LIKE '% key %'。"""
    text = (en or "").lower()
    text = re.sub(r"[^0-9a-z\u4e00-\u9fff']+", " ", text)
    return " " + _SPACE_RE.sub(" ", text).strip() + " "


def count_words(en: str) -> int:
    return len(re.findall(r"[A-Za-z][A-Za-z'-]*", en or ""))


def split_words(raw: str | list[str] | None) -> list[str]:
    """把「逗号 / 分号 / 换行」分隔的字符串拆成单词列表，保持顺序去重。"""
    if raw is None:
        return []
    if isinstance(raw, list):
        candidates = [str(x) for x in raw]
    else:
        candidates = _WORD_SPLIT_RE.split(str(raw))
    out: list[str] = []
    for item in candidates:
        word = item.strip()
        if word and word not in out:
            out.append(word)
    return out


def strip_outer_quotes(text: str) -> str:
    """剥离词典里成对包裹的引号，`""` 还原成 `"`。"""
    value = (text or "").strip()
    changed = True
    while changed and len(value) >= 2:
        changed = False
        for left, right in _QUOTE_PAIRS:
            if value.startswith(left) and value.endswith(right):
                value = value[1:-1].strip()
                changed = True
                break
    if value == '""':
        value = '"'
    return value


def normalize_images(images: list[str] | None) -> list[str]:
    """去空、去重、截断到上限，保持传入顺序。"""
    out: list[str] = []
    for item in images or []:
        path = str(item or "").strip()
        if path and path not in out:
            out.append(path)
    return out[: settings.MAX_CARD_IMAGES]


def to_static_url(path: str) -> str:
    """把磁盘/历史路径转成可访问 URL。

    历史数据里是 `data/images/xxx.png` 这种相对路径，迁移后统一落到
    `storage/images/xxx.png`，对外暴露成 `/static/images/xxx.png`。

    `images/` 之后的子目录要保留：配图按卡片隔离后是
    `storage/images/cards/12/xxx.png`，只取 basename 会把卡片目录抹掉。
    """
    if not path:
        return ""
    if path.startswith(("http://", "https://")):
        return path

    raw = path.replace("\\", "/")
    prefix = settings.STATIC_URL.rstrip("/") + "/"
    if raw.startswith(prefix) or raw.startswith("/static/"):
        return raw

    marker = "images/"
    index = raw.rfind(marker)
    rel = raw[index + len(marker) :] if index >= 0 else raw.rsplit("/", 1)[-1]
    return f"{prefix}images/{rel}"


def to_local_path(path: str) -> str:
    """把存储里的路径还原成磁盘绝对路径。

    - `/static/images/xxx.png` → `storage/images/xxx.png` 的绝对路径
    - `file:///Users/...` → 去掉协议头
    - 已经是绝对路径的（用户粘贴的本地路径）原样返回
    """
    raw = (path or "").strip()
    if not raw:
        return ""

    if raw.startswith("file://"):
        raw = unquote(raw[7:])

    prefix = settings.STATIC_URL.rstrip("/") + "/"
    if raw.startswith(prefix):
        return str((settings.STATIC_DIR / raw[len(prefix) :]).resolve())
    # STATIC_URL 被改过时兜底：老数据里写死的 /static/ 前缀
    if raw.startswith("/static/"):
        return str((settings.STATIC_DIR / raw[len("/static/") :]).resolve())

    candidate = Path(raw).expanduser()
    if candidate.is_absolute() or _WIN_ABS_RE.match(raw):
        return str(candidate)
    return str((settings.STATIC_DIR / raw).resolve())


def is_local_abs_path(path: str) -> bool:
    """判断输入是不是「本机绝对路径」。

    这类路径浏览器访问不到（会被解析成站点下的相对地址），必须先复制进
    `storage/images` 才能通过 `/static` 暴露。URL 和 `/static/...` 不算。
    """
    raw = (path or "").strip()
    if not raw or raw.startswith(("http://", "https://")):
        return False
    if raw.startswith("file://"):
        return True
    if raw.startswith(settings.STATIC_URL.rstrip("/") + "/"):
        return False
    return Path(raw).expanduser().is_absolute() or bool(_WIN_ABS_RE.match(raw))
