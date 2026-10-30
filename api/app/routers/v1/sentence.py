from fastapi import Depends, Query

from app.core.app_code import AppCode
from app.core.dependencies import SessionDep
from app.core.exception import NotFoundError
from app.core.http_handler import PageRespModel, RespModel, make_response
from app.routers import BaseAPIRouter
from app.schemas.sentence import (
    SentenceDetail,
    SentenceItem,
    SentenceQuery,
    SentenceSourceItem,
)
from app.services.sentence import sentence_service
from app.utils.paginator import PaginatedResponse

router = BaseAPIRouter(prefix="/sentence", tags=["句库"])


@router.get("", summary="句库列表", response_model=PageRespModel[SentenceItem])
async def list_sentences(session: SessionDep, query: SentenceQuery = Depends()):
    items, total = await sentence_service.list(
        session,
        keyword=query.keyword,
        source=query.source,
        min_words=query.min_words,
        max_words=query.max_words,
        offset=query.offset,
        limit=query.limit,
    )
    return make_response(data=PaginatedResponse.build(items, total, query.page, query.limit))


@router.get("/sources", summary="句库来源", response_model=RespModel[list[SentenceSourceItem]])
async def list_sources(session: SessionDep):
    return make_response(data=await sentence_service.sources(session))


@router.get("/for-word", summary="按单词取例句", response_model=RespModel[list[SentenceItem]])
async def sentences_for_word(
    session: SessionDep,
    word: str = Query(..., min_length=1),
    limit: int = Query(5, ge=1, le=50),
):
    return make_response(data=await sentence_service.for_word(session, word, limit))


@router.get("/{sentence_id}", summary="句子详情", response_model=RespModel[SentenceDetail])
async def get_sentence(sentence_id: int, session: SessionDep):
    detail = await sentence_service.get(session, sentence_id)
    if not detail:
        raise NotFoundError("句子不存在", code=AppCode.SENTENCE_NOT_FOUND)
    return make_response(data=detail)
