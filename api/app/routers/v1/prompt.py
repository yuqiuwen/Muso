from fastapi import Body

from app.core.dependencies import SessionDep
from app.core.http_handler import RespModel, make_response
from app.routers import BaseAPIRouter
from app.schemas.prompt import RenderPayload, RenderResult, TemplateItem, TemplateSavePayload
from app.services.prompt import prompt_service

router = BaseAPIRouter(prefix="/prompt", tags=["提示词模板"])


@router.get("", summary="模板列表", response_model=RespModel[list[TemplateItem]])
async def list_templates(session: SessionDep):
    return make_response(data=await prompt_service.list(session))


@router.get("/{template_id}", summary="模板详情", response_model=RespModel[TemplateItem])
async def get_template(template_id: str, session: SessionDep):
    return make_response(data=await prompt_service.get(session, template_id))


@router.post("", summary="新建模板", response_model=RespModel[TemplateItem])
async def create_template(session: SessionDep, data: TemplateSavePayload):
    return make_response(data=await prompt_service.create(session, data))


@router.put("/{template_id}", summary="更新模板", response_model=RespModel[TemplateItem])
async def update_template(template_id: str, session: SessionDep, data: TemplateSavePayload):
    return make_response(data=await prompt_service.update(session, template_id, data))


@router.delete("/{template_id}", summary="删除模板", response_model=RespModel[bool])
async def delete_template(template_id: str, session: SessionDep):
    return make_response(data=await prompt_service.delete(session, template_id))


@router.post("/{template_id}/duplicate", summary="复制模板", response_model=RespModel[TemplateItem])
async def duplicate_template(template_id: str, session: SessionDep):
    return make_response(data=await prompt_service.duplicate(session, template_id))


@router.post("/render", summary="按字段渲染模板", response_model=RespModel[RenderResult])
async def render_template(session: SessionDep, data: RenderPayload):
    text, missing = await prompt_service.render(session, data.template_id, data.fields)
    return make_response(data=RenderResult(text=text, missing=missing))
