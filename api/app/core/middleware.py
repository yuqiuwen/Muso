import time
import uuid

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.core.loggers import app_logger


def register_middleware(app: FastAPI) -> None:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins or ["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Request-Id", "X-Process-Time"],
    )

    @app.middleware("http")
    async def request_context_middleware(request: Request, call_next):
        request_id = uuid.uuid4().hex[:16]
        started = time.perf_counter()

        # X-Forwarded-For 优先，方便放在反代后面
        forwarded = request.headers.get("X-Forwarded-For")
        request.state.real_ip = forwarded.split(",")[0].strip() if forwarded else (
            request.client.host if request.client else "-"
        )
        request.state.request_id = request_id

        response = await call_next(request)
        elapsed_ms = (time.perf_counter() - started) * 1000
        response.headers["X-Request-Id"] = request_id
        response.headers["X-Process-Time"] = f"{elapsed_ms:.1f}"

        if settings.ENABLE_REQ_LOG and not request.url.path.startswith("/static"):
            app_logger.info(
                f"{request.method} {request.url.path} {request.state.real_ip} "
                f"{response.status_code} {elapsed_ms:.0f}ms {request_id}"
            )
        return response
