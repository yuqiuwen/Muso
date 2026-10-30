from fastapi import Depends

from app.core.app_code import AppCode
from app.core.dependencies import SessionDep
from app.core.exception import NotFoundError
from app.core.http_handler import PageRespModel, RespModel, make_response
from app.routers import BaseAPIRouter
from app.schemas.word import (
    DictSourceItem,
    WordBrief,
    WordDetail,
    WordLookupItem,
    WordLookupPayload,
    WordMultiQuery,
    WordMultiResult,
    WordQuery,
)
from app.services.word import word_service
from app.utils.paginator import PaginatedResponse

router = BaseAPIRouter(prefix="/word", tags=["词库"])


@router.get("", summary="词库列表", response_model=PageRespModel[WordBrief])
async def list_words(session: SessionDep, query: WordQuery = Depends()):
    items, total = await word_service.list(
        session,
        keyword=query.keyword,
        source=query.source,
        letter=query.letter,
        offset=query.offset,
        limit=query.limit,
    )
    return make_response(data=PaginatedResponse.build(items, total, query.page, query.limit))


@router.get("/sources", summary="词典来源", response_model=RespModel[list[DictSourceItem]])
async def list_sources(session: SessionDep):
    return make_response(data=await word_service.sources(session))


@router.post("/lookup", summary="批量取词", response_model=RespModel[list[WordLookupItem]])
async def lookup_words(session: SessionDep, payload: WordLookupPayload):
    return make_response(data=await word_service.lookup(session, payload.words))


@router.post("/multi", summary="多词搜索", response_model=RespModel[WordMultiResult])
async def multi_search_words(session: SessionDep, payload: WordMultiQuery):
    return make_response(
        data=await word_service.multi_search(
            session,
            text=payload.text,
            source=payload.source,
            limit=payload.limit,
        )
    )


@router.get("/{word_id}", summary="词条详情", response_model=RespModel[WordDetail])
async def get_word(word_id: int, session: SessionDep):
    detail = await word_service.get(session, word_id)
    if not detail:
        raise NotFoundError("词条不存在", code=AppCode.WORD_NOT_FOUND)
    return make_response(data=detail)
