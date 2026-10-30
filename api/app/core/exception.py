from enum import Enum

from app.core.app_code import AppCode


class APIException(Exception):
    """业务异常：路由/服务层主动抛出，由统一异常处理器转成 envelope。"""

    def __init__(self, description=None, code: int | Enum = 500, errmsg: str | None = None):
        super().__init__(description)
        self.description = description
        self.code = int(code.value) if isinstance(code, Enum) else int(code)
        self.errmsg = errmsg
        self.message = description


class NotFoundError(APIException):
    def __init__(self, errmsg: str = "资源不存在", *, code: Enum = AppCode.NOT_FOUND):
        super().__init__(errmsg, code=code, errmsg=errmsg)


class ValidateError(APIException):
    def __init__(self, errmsg: str = "参数错误", *, code: Enum = AppCode.PARAM_ERROR):
        super().__init__(errmsg, code=code, errmsg=errmsg)


class ConflictError(APIException):
    def __init__(self, errmsg: str = "数据冲突", *, code: Enum = AppCode.CONFLICT):
        super().__init__(errmsg, code=code, errmsg=errmsg)
