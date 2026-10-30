# 妙作 Muso

面向内容创作者的一站式创作工作台：**图文 / 视频 / 音乐** 三个模块。当前「图文」已完整落地——从词库挑词、句库取例、提示词模板渲染，到 AI 生成文案、配图排序、卡片发布，形成一条闭环。视频与音乐为占位模块，等待后续接入。

由原 Streamlit 版本（`../learning-card-maker`）重构而来，数据已全量迁移。

```
Muso/
├── api/    Python 3.13 · FastAPI · SQLAlchemy 2.0 (async) · SQLite · Celery · PydanticAI · uv
└── web/    React 19 · TanStack Start v1 · Vite 7 · Tailwind v4 · shadcn/ui · Zustand · TanStack Query
```

---

## 快速开始

### 一键启动（推荐）

```bash
./start.sh
```

同时拉起后端（8000）与前端（8081），`Ctrl+C` 一起停掉，不留孤儿进程。

| 参数 | 说明 |
| --- | --- |
| `--api-port 8010` | 后端端口，也可用环境变量 `API_PORT` |
| `--web-port 8090` | 前端端口，也可用环境变量 `WEB_PORT` |
| `--no-reload` | 关掉后端热重载（调试重启时更快） |
| `-h` / `--help` | 查看用法 |

脚本顺带做了这些事：`api/.env` 缺失时从 `.env.example` 复制一份；`web/node_modules` 缺失时自动 `npm install`；端口被占用时跳过对应服务并提示；任一服务意外退出时把另一个也收掉；日志带 `[api]` / `[web]` 前缀实时输出，同时落盘到 `.logs/api.log` 与 `.logs/web.log`。

### 分别启动（调试单侧时用）

#### 后端（端口 8000）

```bash
cd api
uv sync                       # 首次
cp .env.example .env          # 首次，按需改
uv run uvicorn app.main:app --reload
```

- 接口文档：<http://127.0.0.1:8000/docs>
- 健康检查：`GET /v1/sys/health`

#### 前端（端口 8081）

```bash
cd web
npm install                   # 首次
npm run dev
```

打开 <http://127.0.0.1:8081>，自动跳转 `/dashboard`。

> 端口说明：`8080` 常被其他项目占用，这里默认用 `8081`，可通过 `VITE_PORT` 覆盖。
> 开发环境前端只请求同源 `/v1` 与 `/static`，由 Vite 代理转发到后端，因此**不需要配置 CORS**。

### 生产构建

```bash
cd web && npm run build && npm run preview
```

前端产物为纯静态资源，可直接交给 Nginx；`VITE_API_BASE_URL` 指向后端地址即可。

---

## 后端结构

```
api/
├── app/
│   ├── main.py                  # FastAPI 实例 + lifespan
│   ├── constant.py              # CardModule / CardStatus / CARD_TYPES
│   ├── config/                  # 分环境配置（dev / test / unittest / prod）
│   ├── core/                    # 统一响应、异常、日志、中间件、应用装配
│   │   ├── app_code.py          # 业务错误码枚举
│   │   ├── http_handler.py      # RespModel / PageRespModel / make_response
│   │   ├── exception.py         # APIException 及子类
│   │   ├── middleware.py        # CORS + 请求上下文（X-Request-Id / X-Process-Time）
│   │   └── register.py          # lifespan、静态目录挂载、create_app
│   ├── routers/
│   │   ├── __init__.py          # BaseAPIRouter + pkgutil 自动注册
│   │   └── v1/                  # word / sentence / prompt / card / generation / dashboard / media / sys
│   ├── services/                # 业务逻辑（含 cache/ 缓存抽象）
│   ├── repo/                    # 数据访问
│   ├── models/                  # SQLAlchemy 2.0 声明式模型
│   ├── schemas/                 # Pydantic 出入参
│   ├── database/                # 引擎 / 会话 / 建表 / 缓存客户端
│   ├── tasks/                   # Celery 任务与 beat 调度
│   └── utils/                   # 分页、文本归一化等
├── scripts/migrate_legacy.py    # 从旧 SQLite 迁移数据
├── scripts/migrate_card_images.py  # 历史配图搬进 cards/<card_id>/ 并改库里的路径
├── storage/                     # muso.db、images/（cards/<id>/ 一卡一目录）、logs/（gitignore）
├── make_celery.py               # Celery app 入口
└── main.py                      # 兼容入口
```

### 路由自动注册

`app/routers/v1/` 下每个模块只需暴露一个 `router`，新增文件**无需改注册表**：

```python
# app/routers/v1/xxx.py
from app.routers import BaseAPIRouter

router = BaseAPIRouter(prefix="/xxx", tags=["xxx"])
```

`register_all_routes()` 用 `pkgutil.iter_modules` 扫描该包，按 `API_PREFIX` 挂到应用上，启动日志会打印注册结果。

### 统一响应

HTTP 状态码**恒为 200**，业务结果放在 envelope 里：

```json
{ "code": 0, "msg": "successful", "data": { }, "errmsg": null }
```

`code !== 0` 时 `errmsg` 给出人话原因，前端 `request` 层直接抛 `ApiError`，由 TanStack Query 的全局 `onError` 弹 toast。分页数据统一为 `{ items, total, page, limit, pages }`。

### 几个约定

- **无 alembic**：启动时 `Base.metadata.create_all` + `_migrate()` 幂等补列，SQLite 场景够用。
- **SQLite 连接**：`NullPool` + WAL + `PRAGMA foreign_keys=ON`，避免长连接持有 schema 快照。
- **模块级全局必须走模块属性**：`db_module.async_engine`，不要 `from ... import async_engine`——那样在导入期就绑定了 `None`。
- **降级设计**：没配 Redis 就用进程内 TTL 字典；没配 Celery broker 就 `celery_eager` 在 API 进程内同步跑；没配 LLM 就用确定性的 `local` 拼装引擎。**零配置也能跑通全流程。**

---

## 前端结构

```
web/src/
├── routes/
│   ├── __root.tsx               # HTML 外壳、head、字体、404/Error
│   ├── _app.tsx                 # 侧边栏布局（可折叠 / 移动端抽屉）
│   ├── _app/dashboard.tsx       # 工作台
│   ├── _app/cards.tsx           # 图文卡片列表
│   ├── _app/cards_.new.tsx      # 新建（`_` 后缀脱离 /cards 布局）
│   ├── _app/cards_.$cardId.tsx  # 编辑
│   ├── _app/library.tsx         # 词库
│   ├── _app/sentences.tsx       # 句库
│   ├── _app/prompts.tsx         # 提示词模板
│   └── _app/{video,music}.tsx   # 占位模块
├── components/
│   ├── card-editor.tsx          # 双栏编辑器：配图排序 + 文案表单 + AI 生成
│   ├── image-carousel.tsx       # 配图轮播（编辑器预览 + 列表页预览弹窗共用）
│   ├── template-picker.tsx      # 提示词模板选择器：Popover + cmdk，按类型分组 + 前端搜索
│   ├── word-multi-search.tsx    # 词库「多词搜索」：批量查词 + 逐条复制
│   └── ui/                      # shadcn/ui 组件
├── lib/
│   ├── api.ts                   # ky 封装 + ApiError + PageResult
│   ├── api/*.ts                 # 按模块拆分的接口与类型
│   ├── clipboard.ts             # 复制（安全上下文 / execCommand 兜底）
│   ├── word-format.ts           # 词条压成一行：英文 + 音标 + 中文释义（不带词性）
│   └── constant.ts              # 状态/模块/类型常量与配色
├── stores/editor-store.ts       # Zustand：配图顺序、当前预览图
└── styles.css                   # 紫色主题设计令牌（亮 / 暗双套）
```

### 状态与数据的分工

- **服务端状态**交给 TanStack Query（缓存、失效、loading 都由它管）。
- **纯客户端交互状态**（配图拖拽顺序、当前预览下标）放 Zustand，避免为了排序频繁触发请求。
- **列表筛选/分页放 URL**（`/cards?page=3&status=草稿&keyword=风`，`validateSearch` 只保留非默认值）：编辑器是独立路由，进编辑器时列表会被卸载，条件放组件 state 的话返回就全丢、页码也重置回第一页。编辑器的返回箭头走 `router.history.back()`（无上一页时退回列表首页），返回后筛选与页码原样恢复；刷新、贴链接同样生效。关键词在输入框里留一份本地态做 300ms 防抖，写 URL 时用 `replace` 避免每个字压一条历史。
- **提示词模板页同一套规则**：`kind` / `keyword` 也进 URL（`/prompts?kind=2&keyword=海报`）。模板总量很小，按名称过滤在前端做（`name.toLowerCase().includes`），页签计数跟着搜索结果走——搜「海报」时「文本 0」就代表这一类里没有命中。
- **配图轮播只有一个真源**：`editor-store.activeIndex`。embla 的 `select` 事件把新下标写回 store，store 变化再 `scrollTo` 拨过去；`images.length` 变了要 `api.reInit()` 重算吸附点，否则删图后箭头会错位。
- **表单**用 tanstack-form，字段级校验（如提示词 8000 字符上限）在输入时就反馈。

### 路由命名小技巧

`cards_.new.tsx`、`cards_.$cardId.tsx` 用 `_` 后缀，让新建/编辑页**不继承** `/cards` 的列表布局，成为整页编辑器；同时 URL 依然是干净的 `/cards/new`、`/cards/5`。

---

## 主题与配色

品牌色是紫色系，亮色走暖灰白、暗色走近黑，两套都定义在 `src/styles.css` 里。

| 令牌 | 亮色 | 暗色 | 用途 |
| --- | --- | --- | --- |
| `--background` | `#FAFAF9` | `#0D0D0F` | 页面背景 |
| `--sidebar` | `#FFFFFF` | `#111113` | 侧边导航 |
| `--card` | `#FFFFFF` | `#18181B` | 内容卡片 |
| `--popover` | `#FFFFFF` | `#202024` | 弹窗 / 抽屉 / Toast |
| `--field` | `#FAFAFA` | `#18181B` | 输入框背景 |
| `--muted` | `#F4F4F5` | `#27272A` | Hover 背景 |
| `--selected` | `#F5F3FF` | `#2A203D` | 选中背景 |
| `--border` | `#E4E4E7` | `#2C2C31` | 默认边框 |
| `--border-hover` | `#D4D4D8` | `#52525B` | Hover 边框 |
| `--input` | `#E4E4E7` | `#3F3F46` | 输入框 / 描边按钮的边线 |
| `--foreground` | `#18181B` | `#FAFAFA` | 一级文字 |
| `--body-foreground` | `#3F3F46` | `#E4E4E7` | 正文 |
| `--muted-foreground` | `#71717A` | `#A1A1AA` | 次级文字 |
| `--subtle-foreground` | `#A1A1AA` | `#8E8E99` | 辅助文字 / 占位符 |
| `--primary` | `#7C3AED` | `#A78BFA` | 品牌主色 |
| `--primary-hover` | `#6D28D9` | `#C4B5FD` | Hover / Active（暗色下是提亮） |
| `--lilac` | `#C4B5FD` | `#C4B5FD` | AI 状态、辅助装饰 |

> **暗色对比度**：暗色不是把亮色简单反转，几个令牌是按 WCAG 反推的 —— `--subtle-foreground` 从 `#71717A`（卡片上只有 3.7:1）提到 `#8E8E99`（5.5:1）；`--input` 从 `#27272A`（和卡片底色只有 1.19:1，描边按钮 / 输入框等于没边线）提到 `#3F3F46`；`--primary-hover` 改成比 `--primary` 更亮的 `#C4B5FD`，因为暗色里按钮 hover 该「亮起来」而不是压暗。主按钮额外加了一层同色光晕（`dark:shadow-[...]`），避免浅紫大色块在近黑背景上显得发闷。

品牌渐变 `--gradient-primary: linear-gradient(135deg, #7C3AED 0%, #A78BFA 100%)`，工作台 hero 另有一套 `--gradient-hero`：亮色是 `#4C1D95 → #8B5CF6`，暗色起点更深、收尾更亮（`#2E1D4D → #8B5CF6`），在近黑页面里既够醒目又不刺眼。

**切换机制**

- 主题状态在 `src/stores/theme-store.ts`，切换时给 `<html>` 打 `.dark` 并写入 `localStorage["muso-theme"]`。
- `__root.tsx` 的 `<head>` 里有一段内联脚本（`THEME_INIT_SCRIPT`），在首屏渲染前就把 class 打好 —— 否则刷新会先白后黑闪一下。
- 没有本地偏好时跟随系统 `prefers-color-scheme`；用户点过切换后就以本地值为准。
- 切换按钮 `components/theme-toggle.tsx` 同时渲染太阳 / 月亮两个图标，用 `dark:` 变体控制显隐，SSR 与客户端首帧完全一致，不会水合报错。
- Sonner 的 Toaster 挂在 mount 之后才渲染并传入当前主题，避免 SSR 主题不一致的告警。

**加新颜色时**：先往 `@theme inline` 里注册 `--color-xxx: var(--xxx)`，再在 `:root` 和 `.dark` 各给一个值，最后在组件里用 `bg-xxx / text-xxx`。不要在组件里写死 hex，暗色下会漏。

---

## 主要接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/v1/sys/health` | 健康检查（含 LLM / Celery 状态） |
| GET | `/v1/dashboard/overview` | 概览统计、模块分布、最近卡片 |
| GET | `/v1/word` | 词条分页（keyword / source / letter） |
| GET | `/v1/word/{id}` | 词条详情（音标、释义、词典例句） |
| GET | `/v1/word/sources` | 词典来源与条目数 |
| POST | `/v1/word/lookup` | 批量查词（编辑器「检查词库」） |
| POST | `/v1/word/multi` | 多词搜索：逗号/分号/换行分隔，逐词精确命中 |
| GET | `/v1/sentence` | 例句分页（整词匹配 + 来源/词数筛选） |
| GET | `/v1/sentence/for-word` | 按单词取例句 |
| GET/POST/PUT/DELETE | `/v1/prompt` | 提示词模板 CRUD、复制、槽位渲染（带 `kind` 类型） |
| GET/POST/PUT/DELETE | `/v1/card` | 卡片 CRUD、状态流转、置顶 |
| POST | `/v1/card/import` | JSON 导入（支持中英字段别名、多图） |
| PUT | `/v1/card/{id}/images` | 配图排序 / 追加 / 移除 |
| POST | `/v1/generation/run` | AI 生成文案（无模型时走 local 引擎） |
| POST | `/v1/media/upload` | 图片上传（15 MB、格式白名单；带 `card_id` 直接落卡片目录） |
| POST | `/v1/media/import-local` | 导入本机绝对路径的图片（复制进 `storage/images/cards/<id>/`，按内容哈希命名） |

> **配图路径的两种写法**：`/static/images/cards/<card_id>/xxx.png` 直接可用；`/Users/you/a.png` 这类本机绝对路径浏览器访问不到（会被当成站点下的相对地址而 404），前端会先调 `import-local` 复制进 storage 再换成 `/static` 路径。接口层也做了同样的兜底，直接调 API 传绝对路径同样能存对。
>
> **配图按卡片分目录**：一张卡片的图全部落在 `storage/images/cards/<card_id>/`，库里只存 `/static/images/cards/<id>/<hash>.<ext>`。上传/粘贴本机路径/历史散图在保存卡片时统一由 `media_service.adopt()` 收进卡片目录（已在目录内的幂等放行，外链不动）；换图、删图、删卡片会顺手清掉目录里没人引用的文件。新建卡片时还没 id，上传先进 `storage/images/pending/`，保存时归位。历史数据用 `scripts/migrate_card_images.py` 迁移（默认预演，`--apply` 才落盘）。
>
> **内容约束**：单张卡片最多 **15 张**配图（`settings.MAX_CARD_IMAGES`，前端 `lib/constant.ts` 的 `MAX_CARD_IMAGES` 需同步），单张图片 ≤ 15 MB，格式白名单 `png / jpg / jpeg / webp / gif / avif`。上限通过 `GET /v1/sys/meta` 暴露。
>
> **提示词模板的类型**：`kind` 取 `1 文本` / `2 生图` / `3 其他`（后端 `constant.PromptKind`，前端 `PROMPT_KINDS` 需同步），不传默认 `1`。列表页按类型筛选、卡片右上角显示类型徽章。历史模板没有这个字段，`init_db` 加列时按「名字前缀 `【生图】/【文本】/【待定】` → 内容关键词（生成一张 / 请画 / 插画 / 海报…）」回填一次，之后不再覆盖，手动改过的类型不会被迁移冲掉。

### 词库的两套搜索

- **单词**：`keyword` 模糊匹配单词或中文释义，可按词典来源、首字母筛选，分页。
- **多词**：一次贴一批词（`abandon, ability，abstract` 中英文逗号、分号、换行都行），**逐词精确命中** `word_key` 索引，返回顺序与输入一致；没收录的词单独标出来，可一键跳回单词模式再搜。分隔符在前端只用于「已输入 N 个词」的即时提示，真正的拆分在后端 `split_words`，两边不用各写一套。单次最多 50 个词，超出部分截断（`truncated: true`）。

复制统一走 `lib/word-format.ts`：`单词 /音标/ 中文释义`，**不带词性、释义不含英文**。词典释义原文是「英文描述 + 中文对应词」混排，这里逐行删掉英文片段、从第一个汉字处切起，只留中文义项（最多 3 个，超了加 `…`）；纯英文释义的英英词条就不复制释义，只给单词和音标。

---

## 数据迁移

旧库路径通过参数传入，脚本用**只读短连接**分批读、写完即关，不会影响原项目：

```bash
cd api
uv run python scripts/migrate_legacy.py --src ../learning-card-maker/data/cards.db
```

迁移结果：词条 135,214（去重）· 例句 59,792 · 模板 5 · 卡片 5 · 词典来源 6 · 句库来源 1，配图已复制到 `api/storage/images/cards/<card_id>/`。

配图从「扁平目录」升级到「一卡一目录」后，历史数据用单独脚本迁移（默认只预演，看清数量再加 `--apply`）：

```bash
cd api
uv run python scripts/migrate_card_images.py            # 预演：搬多少份、改多少行
uv run python scripts/migrate_card_images.py --apply    # 搬文件 + 更新 card_images.path
```

同一张图被多张卡片引用时，第一张用搬、其余复制，谁的图都不会丢；搬完后 `storage/images/` 根目录剩的都是没人引用的散图，默认只统计，加 `--purge-orphans` 才删。

---

## 测试与质量

```bash
cd api && uv run ruff check app scripts        # 全绿
cd web && npx tsc --noEmit                     # 全绿
cd web && npm run lint
```

浏览器走查覆盖 9 条路由（工作台 / 卡片列表 / 新建 / 编辑 / 词库 / 句库 / 提示词 / 视频 / 音乐）与 404 页，**亮色 + 暗色各走一遍共 18 次加载，控制台零报错**；新建卡片 → 保存 → 跳转 → 接口回查的链路已实测通过；桌面 1440 与移动 390px 布局均已验证；主题切换、刷新持久化、跟随系统深浅色都已实测。

界面截图**不入库**：36 张约 13 MB，属于本地走查产物，跟代码版本强绑定、很快过期，`.gitignore` 已排除 `docs/screenshots/`。需要时用无头 Chrome 脚本重新生成，按下面的命名放到 `docs/screenshots/` 即可：

- 亮色：`dashboard.png`、`cards.png`、`card-editor.png`、`library.png`、`prompts.png`
- 暗色：`dashboard-dark.png`、`cards-dark.png`、`card-editor-dark.png`、`library-dark.png`、`prompts-dark.png`
- 词库多词搜索：`library-multi.png`、`library-multi-dark.png`、`library-multi-mobile.png`、`library-sheet.png`
- 提示词类型：`prompts-kind.png`、`prompts-kind-image.png`、`prompts-kind-dialog.png`、`prompts-kind-dark.png`
- 提示词名称搜索：`prompts-search.png`、`prompts-search-kind.png`、`prompts-search-empty.png`、`prompts-search-dark.png`、`prompts-search-mobile.png`
- 编辑器模板选择器（分组 + 搜索）：`card-editor-picker.png`、`card-editor-picker-search.png`、`card-editor-picker-empty.png`、`card-editor-picker-selected.png`、`card-editor-picker-dark.png`、`card-editor-picker-mobile.png`
- 卡片 JSON 导入：`cards-import.png`、`cards-import-dark.png`
- 移动端：`mobile-dashboard.png`
