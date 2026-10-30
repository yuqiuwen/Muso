export const CARD_STATUSES = ["草稿", "待发布", "已上架", "已下架"] as const;
export type CardStatus = (typeof CARD_STATUSES)[number];

export const STATUS_STYLE: Record<string, string> = {
  草稿: "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700",
  待发布:
    "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/30",
  已上架:
    "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-400 dark:border-sky-500/30",
  已下架:
    "bg-red-50 text-red-600 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/30",
};

export const STATUS_DOT: Record<string, string> = {
  草稿: "bg-zinc-400 dark:bg-zinc-500",
  待发布: "bg-amber-500",
  已上架: "bg-sky-500",
  已下架: "bg-red-500",
};

export type CardModule = "image" | "video" | "music";

export const MODULES: {
  key: CardModule;
  label: string;
  en: string;
  hint: string;
  enabled: boolean;
}[] = [
  { key: "image", label: "图文", en: "Image", hint: "单词卡片 · 图文海报", enabled: true },
  { key: "video", label: "视频", en: "Video", hint: "脚本 · 分镜 · 成片", enabled: false },
  { key: "music", label: "音乐", en: "Music", hint: "歌词 · 编曲 · 音色", enabled: false },
];

export const CARD_TYPES = ["英语单词卡片", "图文卡片", "视频脚本", "音乐卡片"] as const;

export const PAGE_SIZE_OPTIONS = [12, 24, 48];

// 单张卡片的配图上限，与后端 settings.MAX_CARD_IMAGES 保持一致
export const MAX_CARD_IMAGES = 15;

// 提示词模板类型，值同时是接口字段 kind 的取值，与后端 constant.PromptKind 对齐
export const PROMPT_KINDS = [
  { value: 1, label: "文本", hint: "配文 / 文案" },
  { value: 2, label: "生图", hint: "画面提示词" },
  { value: 3, label: "其他", hint: "视频 / 脚本" },
] as const;

export type PromptKind = (typeof PROMPT_KINDS)[number]["value"];

export const PROMPT_KIND_STYLE: Record<number, string> = {
  1: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-400 dark:border-sky-500/30",
  2: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:border-violet-500/30",
  3: "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700",
};

export const promptKindLabel = (kind: number) =>
  PROMPT_KINDS.find((k) => k.value === kind)?.label ?? "其他";
