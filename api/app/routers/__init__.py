"""路由自动注册。

约定：`app/routers/<version>/` 下每个模块暴露一个 `router` 对象，
版本包（如 `v1`）里用 `API_PREFIX` 指定挂载前缀。新增模块零改动。
"""

import importlib
import pkgutil

from fastapi import APIRouter, FastAPI

from app.config import settings
from app.core.loggers import app_logger


class BaseAPIRouter(APIRouter):
    def __init__(
        self,
        *args,
        response_model_exclude_none=True,
        **kwargs,
    ):
        super().__init__(*args, **kwargs)
        self.response_model_exclude_none = response_model_exclude_none

    def add_api_route(self, path: str, endpoint, **kwargs):
        kwargs.setdefault("response_model_exclude_none", self.response_model_exclude_none)
        return super().add_api_route(path, endpoint, **kwargs)


root_route = APIRouter()


def register_all_routes(app: FastAPI) -> None:
    pkg = importlib.import_module("app.routers")
    pkg_name = pkg.__name__
    router_name = "router"

    for _, name, is_pkg in pkgutil.iter_modules(pkg.__path__, prefix=pkg_name + "."):
        if not is_pkg:
            continue

        version_module = importlib.import_module(name)
        api_prefix = getattr(version_module, "API_PREFIX", name.split(".")[-1])
        registered: list[str] = []

        for _, submodule_name, _ in pkgutil.iter_modules(
            version_module.__path__, prefix=name + "."
        ):
            if submodule_name.endswith("__init__"):
                continue
            submodule = importlib.import_module(submodule_name)
            router = getattr(submodule, router_name, None)
            if router is None:
                continue
            root_route.include_router(router, prefix="/" + api_prefix)
            registered.append(submodule_name.split(".")[-1])

        app_logger.info(f"注册 {api_prefix} 路由 {len(registered)} 个: {', '.join(registered)}")

    app.include_router(root_route)
