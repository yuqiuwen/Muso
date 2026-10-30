# 妙作 Muso

面向内容创作者的一站式创作工作台，分**图文 / 视频 / 音乐**三个模块。当前「图文」已完整落地：从词库挑词、句库取例、提示词模板渲染，到 AI 生成文案、配图排序、卡片发布，形成闭环；视频与音乐是占位页。

| 侧 | 技术栈 |
| --- | --- |
| `api/` | Python 3.13 · FastAPI · SQLAlchemy 2.0 (async) · SQLite · Celery · PydanticAI · uv |
| `web/` | React 19 · TanStack Start v1 · Vite 7 · Tailwind v4 · shadcn/ui · Zustand · TanStack Query |

---

## 快速开始

### 一键启动

```bash
./start.sh
```

同时拉起后端（8000）与前端（8081），`Ctrl+C` 一起停，不留孤儿进程。首次运行会自动从 `.env.example` 复制出 `api/.env`、缺 `node_modules` 时自动 `npm install`，两个服务的日志带 `[api]` / `[web]` 前缀输出到 `.logs/`。

| 参数 | 说明 |
| --- | --- |
| `--api-port 8010` | 后端端口，也可用环境变量 `API_PORT` |
| `--web-port 8090` | 前端端口，也可用环境变量 `WEB_PORT` |
| `--no-reload` | 关掉后端热重载 |
| `-h` / `--help` | 查看用法 |

### 分别启动

后端（8000）：

```bash
cd api
uv sync
cp .env.example .env      # 首次，按需填 LLM Key
uv run uvicorn app.main:app --reload
```

接口文档 <http://127.0.0.1:8000/docs>，健康检查 `GET /v1/sys/health`。

前端（8081）：

```bash
cd web
npm install
npm run dev
```

打开 <http://127.0.0.1:8081> 会跳到 `/dashboard`。开发环境前端只请求同源 `/v1` 与 `/static`，由 Vite 代理转发到后端，**不需要配 CORS**；端口可用 `VITE_PORT` 覆盖。

### 生产构建

```bash
cd web && npm run build && npm run preview
```

产物是纯静态资源，交给 Nginx 即可。开发环境请求走同源代理，生产环境则读 `VITE_API_BASE_URL`：如果由 Nginx 把 `/v1` 与 `/static` 反代到后端，这一项可以留空。

---

## 项目结构

```
api/
├── app/
│   ├── main.py          # FastAPI 实例 + lifespan
│   ├── constant.py      # CardModule / CardStatus / PromptKind 等枚举
│   ├── config/          # 分环境配置（dev / test / unittest / prod）
│   ├── core/            # 统一响应、异常、日志、中间件、应用装配
│   ├── routers/v1/      # word / sentence / prompt / card / generation / dashboard / media / sys
│   ├── services/        # 业务逻辑（含 cache/ 缓存抽象）
│   ├── repo/            # 数据访问
│   ├── models/          # SQLAlchemy 2.0 声明式模型
│   ├── schemas/         # Pydantic 出入参
│   ├── database/        # 引擎 / 会话 / 建表 / 缓存客户端
│   ├── tasks/           # Celery 任务与 beat 调度
│   └── utils/           # 分页、文本归一化等
├── scripts/             # migrate_legacy.py 旧库迁移、migrate_card_images.py 配图整理
└── storage/             # muso.db、images/、logs/（gitignore，仅保留 .gitkeep）
```

```
web/src/
├── routes/              # 文件路由：dashboard / cards / library / sentences / prompts（video、music 为占位页）
├── components/          # 业务组件 + ui/（shadcn/ui）
├── lib/                 # api.ts、api/*.ts、word-format.ts、clipboard.ts、constant.ts
├── stores/              # Zustand：编辑器配图顺序、主题
└── styles.css           # 主题设计令牌（亮 / 暗双套）
```

---

## 后端约定

- **路由自动注册**：`app/routers/v1/` 下每个模块暴露一个 `router`，新增文件不用改注册表，`register_all_routes()` 用 `pkgutil` 扫描挂载。
- **统一响应**：HTTP 状态码恒为 200，业务结果放 envelope —— `{ "code": 0, "msg": "successful", "data": {}, "errmsg": null }`。`code !== 0` 时 `errmsg` 给人话原因，前端抛 `ApiError` 由全局 `onError` 弹 toast。分页统一 `{ items, total, page, limit, pages }`。
- **无 alembic**：启动时 `create_all` + `_migrate()` 幂等补列，SQLite 场景够用；连接用 `NullPool` + WAL + `PRAGMA foreign_keys=ON`。
- **降级设计**：没配 Redis 用进程内 TTL 字典，没配 Celery broker 就在 API 进程内同步跑任务，没配 LLM 用确定性的 local 引擎拼装 —— **零配置也能跑通全流程**。

## 前端约定

- **服务端状态**交给 TanStack Query；**纯客户端交互状态**（配图顺序、预览下标）放 Zustand，避免为了排序频繁请求。
- **列表筛选与分页放 URL**（`/cards?page=3&status=草稿&keyword=风`）：`validateSearch` 只保留非默认值，关键词用 `replace` 写入，避免每个字压一条历史。刷新、后退、从编辑器返回都能回到同一屏。
- **配图轮播只有一个真源**：`editor-store.activeIndex`。embla 的 `select` 事件写回 store，store 变化再 `scrollTo`；图片增删后要 `api.reInit()` 重算吸附点，否则箭头会错位。
- `cards_.new.tsx`、`cards_.$cardId.tsx` 的 `_` 后缀让新建/编辑页不继承列表布局，URL 仍是干净的 `/cards/new`、`/cards/5`。

## 主题

紫色系，亮色走暖灰白、暗色走近黑，令牌全部定义在 `web/src/styles.css`：

| 令牌 | 亮色 | 暗色 |
| --- | --- | --- |
| `--background` | `#FAFAF9` | `#0D0D0F` |
| `--card` | `#FFFFFF` | `#18181B` |
| `--border` | `#E4E4E7` | `#2C2C31` |
| `--foreground` | `#18181B` | `#FAFAFA` |
| `--muted-foreground` | `#71717A` | `#A1A1AA` |
| `--primary` | `#7C3AED` | `#A78BFA` |

暗色不是把亮色反转：次级文字和输入框边线是按对比度提亮过的，主按钮 hover 也是「更亮」而不是压暗。

主题状态在 `stores/theme-store.ts`，切换时给 `<html>` 打 `.dark` 并写入 `localStorage["muso-theme"]`；`__root.tsx` 的 `<head>` 里有一段内联脚本，在首屏渲染前就把 class 打好，避免刷新闪白。没有本地偏好时跟随系统 `prefers-color-scheme`。

**加新颜色**：先在 `@theme inline` 注册 `--color-xxx: var(--xxx)`，再在 `:root` 和 `.dark` 各给一个值，组件里用 `bg-xxx`。不要在组件里写死 hex，暗色下会漏。

---

## 主要接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/v1/sys/health` | 健康检查（含 LLM / Celery 状态） |
| GET | `/v1/sys/meta` | 前端需要的上限常量（配图数量等） |
| GET | `/v1/dashboard/overview` | 概览统计、模块分布、最近卡片 |
| GET | `/v1/word` | 词条分页（keyword / source / letter） |
| GET | `/v1/word/{id}` | 词条详情（音标、释义、词典例句） |
| GET | `/v1/word/sources` | 词典来源与条目数 |
| POST | `/v1/word/lookup` | 批量查词（编辑器「检查词库」） |
| POST | `/v1/word/multi` | 多词搜索：逗号 / 分号 / 换行分隔，逐词精确命中 |
| GET | `/v1/sentence` | 例句分页（整词匹配 + 来源 / 词数筛选） |
| GET | `/v1/sentence/for-word` | 按单词取例句 |
| GET/POST/PUT/DELETE | `/v1/prompt` | 提示词模板 CRUD、复制、槽位渲染（带 `kind`） |
| GET/POST/PUT/DELETE | `/v1/card` | 卡片 CRUD、状态流转、置顶 |
| POST | `/v1/card/import` | JSON 导入（支持中英字段别名、多图） |
| PUT | `/v1/card/{id}/images` | 配图排序 / 追加 / 移除 |
| POST | `/v1/generation/run` | AI 生成文案（无模型时走 local 引擎） |
| POST | `/v1/media/upload` | 图片上传（15 MB、格式白名单；带 `card_id` 直接落卡片目录） |
| POST | `/v1/media/import-local` | 导入本机绝对路径的图片（按内容哈希命名） |

**配图存储**：一张卡片的图都在 `storage/images/cards/<card_id>/`，库里只存 `/static/images/cards/<id>/<hash>.<ext>`。上传、粘贴本机路径、历史散图在保存时统一由 `media_service.adopt()` 收进卡片目录（已在目录内幂等放行，外链不动），换图 / 删图 / 删卡片会清掉无人引用的文件；新建卡片还没有 id 时先落 `storage/images/pending/`，保存时归位。

浏览器访问不到 `/Users/you/a.png` 这类本机绝对路径（会被当成站点下的相对地址而 404），前端会先调 `import-local` 复制进 storage 再换成 `/static`，接口层也做了同样的兜底。

**内容约束**：单卡最多 15 张配图（`settings.MAX_CARD_IMAGES`，前端 `MAX_CARD_IMAGES` 需同步）、单张 ≤ 15 MB、格式 `png / jpg / jpeg / webp / gif / avif`。

**模板类型**：`kind` 取 `1 文本` / `2 生图` / `3 其他`（后端 `PromptKind`，前端 `PROMPT_KINDS` 需同步），不传默认 `1`。

### 词库的两套搜索

- **单词**：`keyword` 模糊匹配单词或中文释义，可按词典来源、首字母筛选，分页。
- **多词**：一次贴一批词（中英文逗号、分号、换行都行），**逐词精确命中** `word_key` 索引，返回顺序与输入一致；没收录的词单独标出，可一键跳回单词模式再搜。单次最多 50 个词，超出截断（`truncated: true`）。

复制统一走 `lib/word-format.ts`，格式为 `单词 /音标/ 中文释义`，**不带词性、释义不含英文**：词典释义原文是「英文描述 + 中文对应词」混排，这里逐行删掉英文片段、从第一个汉字处切起，只留中文义项（最多 3 个）；纯英文释义的英英词条就只给单词和音标。

---

## 数据迁移

从旧版 SQLite 导入（只读短连接分批读、写完即关，不影响原项目）：

```bash
cd api
uv run python scripts/migrate_legacy.py --src /path/to/learning-card-maker/data/app.db
```

`--src` 的默认值是开发机上的旧项目路径，换机器时显式传。目标库已有数据、想清空重迁时加 `--force`。

配图从扁平目录升级到「一卡一目录」后，历史数据用单独脚本整理，**默认只预演**：

```bash
cd api
uv run python scripts/migrate_card_images.py            # 预演：搬多少份、改多少行
uv run python scripts/migrate_card_images.py --apply    # 搬文件 + 更新 card_images.path
```

同一张图被多张卡片引用时第一张搬、其余复制，谁的图都不会丢；搬完根目录剩下的散图默认只统计，加 `--purge-orphans` 才删。

## 开发检查

```bash
cd api && uv run ruff check app scripts
cd web && npx tsc --noEmit && npm run lint
```

界面截图属于本地走查产物，不入库（`.gitignore` 已排除 `docs/screenshots/`），需要时用无头 Chrome 脚本重新生成。
