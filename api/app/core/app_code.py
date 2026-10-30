"""业务错误码。0 表示成功，其余按模块分段。"""

from enum import IntEnum


class AppCode(IntEnum):
    """自定义业务 code"""

    # 通用
    PARAM_ERROR = 40000
    NOT_FOUND = 40400
    CONFLICT = 40900

    # 词库 / 句库
    WORD_NOT_FOUND = 41000
    SENTENCE_NOT_FOUND = 41100
    IMPORT_FAILED = 41200

    # 模板
    TEMPLATE_NOT_FOUND = 42000
    TEMPLATE_LIMIT = 42001
    TEMPLATE_BUILTIN_LOCKED = 42002

    # 卡片
    CARD_NOT_FOUND = 43000
    CARD_IMAGE_LIMIT = 43001
    CARD_IMAGE_INVALID = 43002

    # 生成
    GENERATION_NOT_FOUND = 44000
    GENERATION_FAILED = 44001
    LLM_NOT_CONFIGURED = 44002

    # 上传
    UPLOAD_FAIL = 50001
