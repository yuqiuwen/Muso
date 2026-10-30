from fastapi import Depends

from app.config import settings
from app.core.http_handler import RespModel, make_response
from app.models import Base
from app.routers import BaseAPIRouter

router = BaseAPIRouter(prefix="/sys", tags=["系统"])


@router.get("/health", summary="健康检查", response_model=RespModel[dict])
async def health():
    return make_response(
        data={
            "status": "ok",
            "env": settings.ENV,
            "version": settings.FASTAPI_VERSION,
            "llm": bool(settings.MUSO_LLM_MODEL and settings.MUSO_LLM_API_KEY),
            "celery_eager": settings.celery_eager,
        }
    )


@router.get("/meta", summary="内容约束等元信息", response_model=RespModel[dict])
async def meta():
    return make_response(
        data={
            "max_card_images": settings.MAX_CARD_IMAGES,
            "max_template_chars": settings.MAX_TEMPLATE_CHARS,
            "static_url": settings.STATIC_URL,
            "tables": sorted(Base.metadata.tables),
        }
    )
