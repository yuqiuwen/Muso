from app.core.dependencies import SessionDep
from app.core.http_handler import RespModel, make_response
from app.routers import BaseAPIRouter
from app.schemas.generation import DashboardOverview
from app.services.dashboard import dashboard_service

router = BaseAPIRouter(prefix="/dashboard", tags=["工作台"])


@router.get("/overview", summary="工作台概览", response_model=RespModel[DashboardOverview])
async def overview(session: SessionDep):
    return make_response(data=await dashboard_service.overview(session))
