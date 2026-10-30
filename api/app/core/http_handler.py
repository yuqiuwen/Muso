"""统一响应体与异常注册。

约定：HTTP 状态码始终 200，业务结果放在 envelope 的 code 里；
前端 `request.ts` 只需要判 code !== 0 就抛错。
"""

from typing import Any, Generic, TypeVar

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from msgspec import json as msgspec_json
from pydantic import BaseModel, ConfigDict

from app.core.exception import APIException
from app.core.loggers import app_logger
from app.utils.paginator import PaginatedResponse

T = TypeVar("T")


class RespModel(BaseModel, Generic[T]):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    code: int = 0
    msg: str = "successful"
    data: T | None = None
    errmsg: str | None = None


class PageRespModel(RespModel[PaginatedResponse[T]], Generic[T]):
    """统一分页响应：外层 RespModel，data 里是 PaginatedResponse[T]。"""


class MsgSpecJSONResponse(JSONResponse):
    """用 msgspec 序列化，比默认 json 快一截，且能直接吃 dataclass / ULID。"""

    def render(self, content: Any) -> bytes:
        return msgspec_json.encode(content)


def _build_resp_body(code: int, msg: str, data: Any = None, errmsg: str | None = None) -> dict:
    ret = {"code": code, "msg": msg}
    if data is not None:
        ret["data"] = data
    if errmsg is not None:
        ret["errmsg"] = errmsg
    return ret


def make_response(msg="successful", *, data: Any = None, code=0, errmsg=None) -> RespModel:
    return RespModel(code=code, msg=msg, errmsg=errmsg, data=data)


def make_json_response(msg="successful", *, data: Any = None, code=0, errmsg=None) -> JSONResponse:
    return JSONResponse(
        _build_resp_body(code, msg, data, errmsg),
        media_type="application/json; charset=utf-8",
    )


def register_exc_handler(app: FastAPI) -> None:
    @app.exception_handler(APIException)
    async def api_exc_handler(request: Request, exc: APIException):
        if exc.code >= 500:
            app_logger.error(f"{request.method} {request.url.path} -> {exc.errmsg or exc}")
        return make_json_response(exc.message or "error", code=exc.code, errmsg=exc.errmsg)

    @app.exception_handler(RequestValidationError)
    async def validation_exc_handler(request: Request, exc: RequestValidationError):
        first = exc.errors()[0] if exc.errors() else {}
        loc = ".".join(str(x) for x in first.get("loc", []) if x != "body")
        errmsg = f"{loc}: {first.get('msg', '参数错误')}" if loc else "参数错误"
        app_logger.warning(f"validation error: {errmsg}")
        return make_json_response("parameters error", code=400, errmsg=errmsg)

    @app.exception_handler(Exception)
    async def unhandled_exc_handler(request: Request, exc: Exception):
        app_logger.exception(f"unhandled error on {request.method} {request.url.path}: {exc}")
        return make_json_response("Server Error!", code=500, errmsg="服务器开小差了，请稍后重试")
