from app.core.dependencies import SessionDep
from app.core.http_handler import RespModel, make_response
from app.routers import BaseAPIRouter
from app.schemas.generation import GeneratePayload, GenerationTaskItem
from app.services.generation import generation_service

router = BaseAPIRouter(prefix="/generation", tags=["AI 生成"])


@router.post("/run", summary="发起卡片文案生成", response_model=RespModel[GenerationTaskItem])
async def run_generation(session: SessionDep, data: GeneratePayload):
    task, _inline = await generation_service.create(session, data)
    return make_response(data=task)


@router.get("/{uid}", summary="查询生成任务", response_model=RespModel[GenerationTaskItem])
async def get_generation(uid: str, session: SessionDep):
    return make_response(data=await generation_service.get(session, uid))
