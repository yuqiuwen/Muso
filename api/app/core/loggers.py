"""日志：控制台 + 按天滚动文件。日志目录不写死在 /data，跟着 storage 走。"""

import logging
import sys
from logging.handlers import TimedRotatingFileHandler

from app.config import settings

_FORMAT = "%(asctime)s | %(levelname)-7s | %(name)s | %(message)s"
_DATEFMT = "%Y-%m-%d %H:%M:%S"


class AppLogger:
    initialized = False

    @classmethod
    def init(cls) -> None:
        if cls.initialized:
            return

        level = getattr(settings, "LOG_LEVEL", logging.INFO)
        formatter = logging.Formatter(_FORMAT, datefmt=_DATEFMT)

        root = logging.getLogger("muso")
        root.setLevel(level)
        root.handlers.clear()
        root.propagate = False

        console = logging.StreamHandler(sys.stdout)
        console.setFormatter(formatter)
        root.addHandler(console)

        try:
            settings.LOG_DIR.mkdir(parents=True, exist_ok=True)
            file_handler = TimedRotatingFileHandler(
                settings.LOG_DIR / "muso.log",
                when="midnight",
                backupCount=14,
                encoding="utf-8",
            )
            file_handler.setFormatter(formatter)
            root.addHandler(file_handler)
        except OSError as exc:  # 只读环境里也不能因为日志目录挂掉服务
            root.warning(f"日志文件不可写，仅输出到控制台: {exc}")

        # 压掉 uvicorn access log 的噪音（我们自己有请求日志）
        logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
        cls.initialized = True


app_logger = logging.getLogger("muso")
