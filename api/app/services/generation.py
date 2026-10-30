"""AI 生成：模板渲染 → PydanticAI Agent → 结构化卡片文案。

没配模型时走 `local` 引擎（只做确定性拼装），保证功能可用、也方便离线开发。
"""

from __future__ import annotations

import json

from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.app_code import AppCode
from app.core.exception import APIException, NotFoundError
from app.core.loggers import app_logger
from app.database import db as db_module
from app.models.generation import GenerationTask
from app.repo.generation import generation_repo
from app.schemas.generation import GeneratePayload, GenerationTaskItem
from app.services.prompt import prompt_service
from app.utils.common import gen_uid

SYSTEM_PROMPT = """你是「妙作 Muso」的内容策划。用户会给你一段提示词和卡片字段，
请输出适合中文社交平台发布的内容：
- title：18 字以内，有画面感，可以用一个 emoji 开头
- story：80~160 字，描述画面/场景，供生图或拍摄参考
- caption：可直接发布的配文，分 2~3 段，结尾带 3~5 个话题标签
- tags：5 个以内的话题标签，不带 #
只输出结构化结果，不要解释。"""


class CardCopy(BaseModel):
    title: str = Field(description="卡片标题")
    story: str = Field(description="画面故事描述")
    caption: str = Field(description="发布配文")
    tags: list[str] = Field(default_factory=list, description="话题标签")


def to_item(task: GenerationTask) -> GenerationTaskItem:
    try:
        payload = json.loads(task.payload or "{}")
    except json.JSONDecodeError:
        payload = {}
    try:
        result = json.loads(task.result or "{}")
    except json.JSONDecodeError:
        result = {}
    return GenerationTaskItem(
        id=task.id,
        uid=task.uid,
        card_id=task.card_id,
        template_id=task.template_id,
        kind=task.kind,
        status=task.status,
        engine=task.engine or "",
        prompt=payload.get("prompt", ""),
        result=result if isinstance(result, dict) else {},
        error=task.error or "",
        created_at=task.created_at,
        updated_at=task.updated_at,
    )


def _llm_ready() -> bool:
    return bool(settings.MUSO_LLM_MODEL and settings.MUSO_LLM_API_KEY)


def _build_agent():
    from pydantic_ai import Agent
    from pydantic_ai.models.openai import OpenAIChatModel
    from pydantic_ai.providers.openai import OpenAIProvider

    provider = OpenAIProvider(
        base_url=settings.MUSO_LLM_BASE_URL or None,
        api_key=settings.MUSO_LLM_API_KEY,
    )
    model = OpenAIChatModel(settings.MUSO_LLM_MODEL, provider=provider)
    return Agent(model, output_type=CardCopy, system_prompt=SYSTEM_PROMPT)


def _local_copy(fields: dict, prompt: str) -> CardCopy:
    """没配模型时的确定性拼装：标题/故事/配文都从已有字段推导。"""
    words = fields.get("words") or []
    if isinstance(words, str):
        words = [w.strip() for w in words.replace("\n", ",").split(",") if w.strip()]
    theme = str(fields.get("theme") or "").strip()
    title = str(fields.get("title") or "").strip()
    story = str(fields.get("story") or "").strip()
    content = str(fields.get("content") or "").strip()

    if not title:
        title = f"📖 {theme or '每日英语'}｜{len(words) or '一'}个词"
    if not story:
        story = f"{theme or '英语学习'}主题画面，主体清晰、留白充足，适合做系列卡片主视觉。"
    if not content:
        head = f"{title}\n\n"
        body = "今天这组词：" + "、".join(str(w) for w in words[:8]) + ("…" if len(words) > 8 else "")
        content = head + body + "\n\n#英语学习 #每日一词 #单词卡片"
    tags = ["英语学习", "每日一词", "单词卡片", "图文创作"][:4]
    if not prompt:
        prompt = ""
    return CardCopy(title=title[:40], story=story, caption=content, tags=tags)


class GenerationService:
    async def create(
        self, session: AsyncSession, data: GeneratePayload
    ) -> tuple[GenerationTaskItem, bool]:
        """建任务并返回 (任务, 是否已同步执行完)。"""
        fields = dict(data.fields or {})
        prompt = str(fields.pop("prompt", "") or "")

        if data.template_id:
            text, missing = await prompt_service.render(session, data.template_id, fields)
            prompt = text
            fields["_missing"] = missing

        if not prompt and not data.card_id:
            raise APIException(
                "缺少提示词：请选择模板或直接填写提示词",
                code=AppCode.GENERATION_FAILED,
                errmsg="缺少提示词：请选择模板或直接填写提示词",
            )

        task = GenerationTask(
            uid=gen_uid(),
            card_id=data.card_id,
            template_id=data.template_id,
            kind="card_copy",
            status="pending",
            payload=json.dumps(
                {"prompt": prompt, "fields": fields, "dry_run": data.dry_run}, ensure_ascii=False
            ),
            engine="local" if not _llm_ready() else settings.MUSO_LLM_MODEL,
        )
        await generation_repo.add(session, task)

        if data.dry_run:
            task.status = "success"
            task.result = json.dumps(
                {"prompt": prompt, "title": "", "story": "", "caption": "", "tags": []},
                ensure_ascii=False,
            )
            await generation_repo.save(session, task)
            return to_item(task), True

        from app.tasks.generation import dispatch

        inline = dispatch(task.uid)
        if inline:
            await self.run(task.uid)
            await session.refresh(task)

        return to_item(task), inline

    async def get(self, session: AsyncSession, uid: str) -> GenerationTaskItem:
        task = await generation_repo.get(session, uid)
        if not task:
            raise NotFoundError("生成任务不存在", code=AppCode.GENERATION_NOT_FOUND)
        return to_item(task)

    async def run(self, uid: str) -> None:
        """执行生成：Celery worker 和本地同步模式都走这里。"""
        if db_module.async_db_session is None:
            raise RuntimeError("数据库会话未初始化")

        async with db_module.async_db_session() as session:
            task = await generation_repo.get(session, uid)
            if not task:
                return

            task.status = "running"
            await generation_repo.save(session, task)

            payload = json.loads(task.payload or "{}")
            prompt = payload.get("prompt", "")
            fields = payload.get("fields", {})

            try:
                if _llm_ready():
                    agent = _build_agent()
                    result = await agent.run(prompt)
                    copy = result.output
                    engine = settings.MUSO_LLM_MODEL
                else:
                    copy = _local_copy(fields, prompt)
                    engine = "local"

                task.result = json.dumps(
                    {
                        **copy.model_dump(),
                        "prompt": prompt,
                    },
                    ensure_ascii=False,
                )
                task.status = "success"
                task.engine = engine
                task.error = ""
            except Exception as exc:  # 网络/额度/模型名错误都算任务失败，不抛给调用方
                app_logger.exception(f"生成任务 {uid} 失败: {exc}")
                task.status = "failed"
                task.error = str(exc)[:500]

            await generation_repo.save(session, task)


generation_service = GenerationService()
