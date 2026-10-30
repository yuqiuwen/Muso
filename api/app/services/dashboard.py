"""工作台概览：跨模块统计 + 最近卡片。"""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.constant import CARD_MODULES, CardModule
from app.repo.card import card_repo
from app.schemas.generation import DashboardOverview, DashboardStat, ModuleStat
from app.services.cache.content import DashboardCache
from app.services.card import to_item
from app.services.prompt import prompt_service
from app.services.sentence import sentence_service
from app.services.word import word_service


class DashboardService:
    async def overview(self, session: AsyncSession) -> DashboardOverview:
        cache = DashboardCache()
        cached = await cache.get()
        if cached:
            return DashboardOverview(**cached)

        words = await word_service.count(session)
        sentences = await sentence_service.count(session)
        cards = await card_repo.count(session)
        templates = len(await prompt_service.list(session))

        modules: list[ModuleStat] = []
        for module, label in CARD_MODULES.items():
            total = await card_repo.count_by(session, module=module)
            published = await card_repo.count_by(session, module=module, status="已上架")
            draft = await card_repo.count_by(session, module=module, status="草稿")
            modules.append(
                ModuleStat(
                    module=module,
                    label=label,
                    total=total,
                    draft=draft,
                    published=published,
                    enabled=module == CardModule.IMAGE,
                )
            )

        recent = await card_repo.recent(session, CardModule.IMAGE, limit=6)
        overview = DashboardOverview(
            stats=[
                DashboardStat(label="内容卡片", value=cards, hint="图文 / 视频 / 音乐"),
                DashboardStat(label="词库词条", value=words, hint="6 本词典"),
                DashboardStat(label="双语例句", value=sentences, hint="整词检索"),
                DashboardStat(label="提示词模板", value=templates, hint="支持槽位渲染"),
            ],
            modules=modules,
            status_counts=await card_repo.status_counts(session, CardModule.IMAGE),
            recent_cards=[to_item(c).model_dump(mode="json") for c in recent],
        )
        await cache.add(overview.model_dump(mode="json"))
        return overview


dashboard_service = DashboardService()