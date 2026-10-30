from fastapi import File, Form, UploadFile

from app.core.http_handler import RespModel, make_response
from app.routers import BaseAPIRouter
from app.schemas.media import MediaImportPayload
from app.services.media import media_service

router = BaseAPIRouter(prefix="/media", tags=["媒体"])


@router.post("/upload", summary="上传单张图片", response_model=RespModel[dict])
async def upload_image(file: UploadFile = File(...), card_id: int | None = Form(None)):
    """上传单张图片。

    带 `card_id` 直接落到 `storage/images/cards/<card_id>/`；新建卡片时还没有
    id，先落到 `storage/images/pending/`，保存卡片时由服务层搬进卡片目录。
    """
    return make_response(data=await media_service.save_image(file, card_id))


@router.post("/import-local", summary="导入本机绝对路径的图片", response_model=RespModel[list[dict]])
async def import_local_images(data: MediaImportPayload):
    """把 `/Users/you/a.png` 这类本地路径复制进 storage，返回 /static 路径。

    浏览器拿不到磁盘上的任意文件，前端粘贴本地路径时必须先过这一层，
    否则 `<img src="/Users/you/a.png">` 会被解析成站点下的相对地址而 404。
    """
    return make_response(data=media_service.import_local(data.paths, data.card_id))
