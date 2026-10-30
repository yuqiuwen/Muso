from pydantic import BaseModel, Field


class MediaImportPayload(BaseModel):
    """粘贴本地绝对路径导入：每行一个，最多一次 20 个。"""

    paths: list[str] = Field(..., min_length=1, max_length=20)
    # 编辑已有卡片时传 id，图片直接落进该卡片的目录；新建时留空走 pending
    card_id: int | None = None
