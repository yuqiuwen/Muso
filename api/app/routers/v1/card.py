from fastapi import Depends, File, UploadFile

from app.core.dependencies import SessionDep
from app.core.http_handler import PageRespModel, RespModel, make_response
from app.routers import BaseAPIRouter
from app.schemas.card import (
    CardDetail,
    CardImageOrderPayload,
    CardImagesPayload,
    CardImportPayload,
    CardImportResult,
    CardItem,
    CardQuery,
    CardSavePayload,
    CardStatusPayload,
)
from app.services.cache.content import invalidate_content_caches
from app.services.card import card_service
from app.services.media import media_service
from app.utils.paginator import PaginatedResponse

router = BaseAPIRouter(prefix="/card", tags=["内容卡片"])


@router.get("", summary="卡片列表", response_model=PageRespModel[CardItem])
async def list_cards(session: SessionDep, query: CardQuery = Depends()):
    items, total = await card_service.list(
        session,
        keyword=query.keyword,
        status=query.status,
        module=query.module,
        theme=query.theme,
        offset=query.offset,
        limit=query.limit,
    )
    return make_response(data=PaginatedResponse.build(items, total, query.page, query.limit))


@router.get("/themes", summary="主题场景列表", response_model=RespModel[list[str]])
async def list_themes(session: SessionDep, module: str = "image"):
    return make_response(data=await card_service.themes(session, module))


@router.post("/import", summary="JSON 批量导入", response_model=RespModel[CardImportResult])
async def import_cards(session: SessionDep, data: CardImportPayload):
    result = await card_service.import_json(session, data.text)
    invalidate_content_caches()
    return make_response(data=result)


@router.get("/{card_id}", summary="卡片详情", response_model=RespModel[CardDetail])
async def get_card(card_id: int, session: SessionDep):
    return make_response(data=await card_service.get(session, card_id))


@router.post("", summary="新建卡片", response_model=RespModel[CardDetail])
async def create_card(session: SessionDep, data: CardSavePayload):
    card = await card_service.create(session, data)
    invalidate_content_caches()
    return make_response(data=card)


@router.put("/{card_id}", summary="更新卡片", response_model=RespModel[CardDetail])
async def update_card(card_id: int, session: SessionDep, data: CardSavePayload):
    card = await card_service.update(session, card_id, data)
    invalidate_content_caches()
    return make_response(data=card)


@router.delete("/{card_id}", summary="删除卡片", response_model=RespModel[bool])
async def delete_card(card_id: int, session: SessionDep):
    ret = await card_service.delete(session, card_id)
    invalidate_content_caches()
    return make_response(data=ret)


@router.put("/{card_id}/status", summary="改状态", response_model=RespModel[CardItem])
async def set_status(card_id: int, session: SessionDep, data: CardStatusPayload):
    ret = await card_service.set_status(session, card_id, data.status)
    invalidate_content_caches()
    return make_response(data=ret)


@router.put("/{card_id}/pin", summary="置顶切换", response_model=RespModel[CardItem])
async def toggle_pin(card_id: int, session: SessionDep):
    ret = await card_service.toggle_pin(session, card_id)
    invalidate_content_caches()
    return make_response(data=ret)


@router.post("/{card_id}/images", summary="追加配图", response_model=RespModel[CardDetail])
async def append_images(card_id: int, session: SessionDep, data: CardImagesPayload):
    ret = await card_service.append_images(session, card_id, data.paths)
    invalidate_content_caches()
    return make_response(data=ret)


@router.post("/{card_id}/images/upload", summary="上传并追加配图", response_model=RespModel[CardDetail])
async def upload_images(
    card_id: int,
    session: SessionDep,
    files: list[UploadFile] = File(...),
):
    # 直接落进这张卡片的目录，不用等保存再搬
    paths = [(await media_service.save_image(f, card_id))["path"] for f in files]
    ret = await card_service.append_images(session, card_id, paths)
    invalidate_content_caches()
    return make_response(data=ret)


@router.put("/{card_id}/images/order", summary="调整配图顺序", response_model=RespModel[CardDetail])
async def reorder_images(card_id: int, session: SessionDep, data: CardImageOrderPayload):
    ret = await card_service.reorder_images(session, card_id, data.paths)
    invalidate_content_caches()
    return make_response(data=ret)


@router.delete("/{card_id}/images/{image_id}", summary="删除配图", response_model=RespModel[CardDetail])
async def remove_image(card_id: int, image_id: int, session: SessionDep):
    ret = await card_service.remove_image(session, card_id, image_id)
    invalidate_content_caches()
    return make_response(data=ret)
