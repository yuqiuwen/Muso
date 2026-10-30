"""FastAPI 入口：`uvicorn app.main:app` 或 `python -m app.main`。"""

from fastapi import FastAPI

from app.core.register import create_app

app: FastAPI = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)
