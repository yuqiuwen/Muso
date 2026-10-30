"""uvicorn 兼容入口（历史习惯）：`uvicorn main:app --reload`。"""

from app.main import app

__all__ = ["app"]
