import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "@tanstack/react-form";
import { useCanGoBack, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  Copy,
  ImagePlus,
  Images,
  Loader2,
  Sparkles,
  Star,
  Trash2,
  Upload,
  Wand2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { cardApi, type CardDetail, type CardImage, type CardSavePayload } from "@/lib/api/card";
import { request } from "@/lib/api";
import { mediaApi } from "@/lib/api/media";
import { promptApi } from "@/lib/api/prompt";
import { generationApi } from "@/lib/api/generation";
import { wordApi } from "@/lib/api/word";
import { useEditorStore, type EditorImageInput } from "@/stores/editor-store";
import { CARD_STATUSES, CARD_TYPES, MAX_CARD_IMAGES } from "@/lib/constant";
import { Button } from "@/components/ui/button";
import { ImageCarousel } from "@/components/image-carousel";
import { TemplatePicker } from "@/components/template-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// 与后端 settings.MAX_CARD_IMAGES 保持一致，改一处记得同步另一处
const MAX_IMAGES = MAX_CARD_IMAGES;

/**
 * 判断输入是不是本机绝对路径。
 *
 * 浏览器只能加载站点内的资源，`/Users/you/a.png` 会被解析成站点下的相对
 * 地址而 404，这类路径必须先交给后端复制进 storage。
 */
const isLocalPath = (raw: string) => {
  const p = raw.trim();
  if (!p || p.startsWith("http://") || p.startsWith("https://")) return false;
  if (p.startsWith("file://")) return true;
  if (p.startsWith("/static/")) return false;
  return p.startsWith("/") || /^[A-Za-z]:[\\/]/.test(p);
};

interface FormValues {
  title: string;
  status: string;
  card_type: string;
  theme: string;
  words: string;
  story: string;
  caption: string;
}

const emptyValues: FormValues = {
  title: "",
  status: "草稿",
  card_type: "英语单词卡片",
  theme: "",
  words: "",
  story: "",
  caption: "",
};

export function CardEditor({ card }: { card?: CardDetail }) {
  const queryClient = useQueryClient();
  const store = useEditorStore();
  const router = useRouter();
  const navigate = useNavigate();
  const canGoBack = useCanGoBack();

  const [promptText, setPromptText] = useState("");
  const [templateId, setTemplateId] = useState<string>("");
  const [aiOpen, setAiOpen] = useState(false);
  const [aiResult, setAiResult] = useState<{
    title?: string;
    story?: string;
    caption?: string;
  } | null>(null);
  const [missingWords, setMissingWords] = useState<string[] | null>(null);
  const [pathBoxOpen, setPathBoxOpen] = useState(false);
  const [pathText, setPathText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  /**
   * 关闭编辑器回列表。
   *
   * 走浏览器历史而不是写死 `/cards`：列表的页码、状态、场景、关键词都记在
   * URL 里，返回时原样恢复，不会被重置回第一页。直接打开编辑器链接（没有
   * 上一页可退）时退回列表首页。
   */
  const closeEditor = () => {
    if (canGoBack) router.history.back();
    else navigate({ to: "/cards" });
  };

  // 进入编辑器时把服务端配图灌进 store；同一个组件实例只做一次
  useEffect(() => {
    store.reset(card?.images ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: templates } = useQuery({ queryKey: ["prompts"], queryFn: () => promptApi.list() });

  const form = useForm({
    defaultValues: card
      ? {
          title: card.title,
          status: card.status,
          card_type: card.card_type,
          theme: card.theme,
          words: card.words.join(", "),
          story: card.story,
          caption: card.caption,
        }
      : emptyValues,
    onSubmit: async ({ value }) => saveMutation.mutate(value),
  });

  const saveMutation = useMutation({
    mutationFn: async (value: FormValues) => {
      const payload: CardSavePayload = {
        title: value.title.trim(),
        module: "image",
        status: value.status as never,
        card_type: value.card_type,
        theme: value.theme.trim(),
        story: value.story.trim(),
        caption: value.caption.trim(),
        words: value.words,
        images: store.images.map((i) => i.path),
      };
      return card ? cardApi.update(card.id, payload) : cardApi.create(payload);
    },
    onSuccess: (saved) => {
      toast.success(card ? "已保存" : "卡片已创建");
      queryClient.invalidateQueries({ queryKey: ["cards"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["card", saved.id] });
      if (!card) {
        window.location.href = `/cards/${saved.id}`;
      }
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (files: File[]) => {
      const results = await Promise.all(
        files.map(async (file) => {
          const fd = new FormData();
          fd.append("file", file);
          // 编辑已有卡片时直接上传到卡片目录；新建时后端先放 pending，保存再归位
          if (card) fd.append("card_id", String(card.id));
          const uploaded = await request.postForm<{ path: string }>("/v1/media/upload", fd);
          return uploaded?.path;
        }),
      );
      return results.filter((p): p is string => Boolean(p));
    },
    onSuccess: (paths) => {
      const room = MAX_IMAGES - store.images.length;
      if (paths.length > room)
        toast.warning(`最多 ${MAX_IMAGES} 张，已忽略 ${paths.length - room} 张`);
      store.append(paths.slice(0, Math.max(room, 0)).map((path) => ({ path })));
    },
  });

  const importLocalMutation = useMutation({
    mutationFn: (paths: string[]) => mediaApi.importLocal(paths, card?.id),
    // 自己弹更具体的提示，避免和全局兜底重复弹两个 toast
    onError: () => {},
  });

  /**
   * 按路径添加配图。
   *
   * 本机绝对路径先让后端复制进 storage 换成 /static 路径，否则浏览器按站点
   * 相对地址去请求，必然 404（这就是「粘贴绝对路径图片渲染不出来」的原因）。
   */
  const addByPath = async () => {
    const paths = pathText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!paths.length) return;

    const local = paths.filter(isLocalPath);
    let items: EditorImageInput[] = paths.map((path) => ({ path }));

    if (local.length) {
      try {
        const imported = await importLocalMutation.mutateAsync(local);
        const bySource = new Map(imported.map((item) => [item.source, item]));
        items = paths.map((path) => {
          const hit = bySource.get(path);
          return hit ? { path: hit.path, local_path: hit.local_path } : { path };
        });
      } catch (err) {
        toast.error("本地图片导入失败", {
          description: err instanceof Error ? err.message : "请检查路径是否正确",
        });
        return;
      }
    }

    const room = MAX_IMAGES - store.images.length;
    if (items.length > room) toast.warning(`最多 ${MAX_IMAGES} 张，已忽略超出的图片`);
    const start = store.images.length;
    store.append(items.slice(0, Math.max(room, 0)));
    // 新加的图片直接切到主预览，不然粘贴完看不到效果（全被去重时不切）
    if (useEditorStore.getState().images.length > start) store.setActive(start);
    setPathText("");
    setPathBoxOpen(false);
  };

  const lookupMutation = useMutation({
    mutationFn: (words: string[]) => wordApi.lookup(words),
    onSuccess: (items) => {
      const missing = items.filter((i) => !i.found).map((i) => i.word);
      setMissingWords(missing);
      if (!missing.length) toast.success("这些词在词库里都能查到");
    },
  });

  const renderMutation = useMutation({
    mutationFn: (tid: string) =>
      promptApi.render(tid, {
        title: form.getFieldValue("title"),
        theme: form.getFieldValue("theme"),
        story: form.getFieldValue("story"),
        words: form.getFieldValue("words"),
        content: form.getFieldValue("caption"),
      }),
    onSuccess: (result) => {
      setPromptText(result.text);
      if (result.missing.length) {
        toast.warning(`还有 ${result.missing.length} 个槽位没填：${result.missing.join("、")}`);
      }
    },
  });

  const aiMutation = useMutation({
    mutationFn: () =>
      generationApi.run({
        template_id: templateId || null,
        card_id: card?.id ?? null,
        fields: {
          title: form.getFieldValue("title"),
          theme: form.getFieldValue("theme"),
          story: form.getFieldValue("story"),
          words: form.getFieldValue("words"),
          content: form.getFieldValue("caption"),
        },
      }),
    onSuccess: (task) => {
      if (task.status === "success") {
        setAiResult(task.result);
        toast.success(task.engine === "local" ? "已用本地模板生成（未配置模型）" : "生成完成");
      } else {
        toast.error(task.error || "生成失败");
      }
    },
  });

  const applyAi = () => {
    if (!aiResult) return;
    if (aiResult.title) form.setFieldValue("title", aiResult.title);
    if (aiResult.story) form.setFieldValue("story", aiResult.story);
    if (aiResult.caption) form.setFieldValue("caption", aiResult.caption);
    setAiOpen(false);
    toast.success("已填入表单，记得保存");
  };

  const images = store.images;
  const active = images[store.activeIndex];

  /**
   * 复制配图的磁盘绝对路径（`/Users/you/.../storage/images/xxx.png`）。
   * 老数据没有 local_path 时退回 `/static/images/xxx.png`。
   * 本机 http://127.0.0.1 属于安全上下文，clipboard API 直接可用；
   * 换成局域网 IP 访问时会退化成非安全上下文，用 execCommand 兜底。
   */
  const copyImagePath = async (image: CardImage) => {
    const path = image.local_path || image.path;
    try {
      await navigator.clipboard.writeText(path);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = path;
      ta.style.position = "fixed";
      ta.style.top = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    toast.success("图片绝对路径已复制", { description: path });
  };

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={closeEditor}
            aria-label="返回列表"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <p className="text-[11px] tracking-[0.16em] text-primary uppercase">
              {card ? `Card #${card.id}` : "New Card"}
            </p>
            <h1 className="truncate text-lg font-semibold">
              {card ? "编辑图文卡片" : "新建图文卡片"}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {card && (
            <Badge variant="outline" className="h-7 text-[11px]">
              更新于 {card.updated_at?.slice(5, 16) ?? "—"}
            </Badge>
          )}
          <Button
            size="sm"
            onClick={() => form.handleSubmit()}
            disabled={saveMutation.isPending}
            className="min-w-[92px]"
          >
            {saveMutation.isPending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="mr-1.5 h-3.5 w-3.5" />
            )}
            保存卡片
          </Button>
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
        className="grid items-start gap-5 lg:grid-cols-[400px_1fr]"
      >
        {/* 左：配图 */}
        <Card className="gap-0 rounded-2xl border-border/70 p-0 shadow-none lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-card px-4 py-3">
            <div className="flex items-center gap-2">
              <Images className="h-4 w-4 text-primary" />
              <span className="text-[13px] font-medium">配图</span>
            </div>
            <span className="tnum text-[11px] text-muted-foreground">
              {images.length} / {MAX_IMAGES}
            </span>
          </div>

          <div className="p-4">
            <div className="relative aspect-[4/5] overflow-hidden rounded-xl border bg-muted/60">
              {active ? (
                <ImageCarousel
                  images={images}
                  index={store.activeIndex}
                  onIndexChange={store.setActive}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground transition-colors hover:text-primary"
                >
                  <ImagePlus className="h-7 w-7" />
                  <span className="text-xs">点击上传第一张配图</span>
                  <span className="text-[10px] text-subtle">
                    支持 PNG / JPG / WEBP，单张 ≤ 15MB
                  </span>
                </button>
              )}
            </div>

            {images.length > 0 && (
              <div className="mt-3 flex gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 flex-1 gap-1 text-[11px]"
                  disabled={store.activeIndex === 0}
                  onClick={() => store.setCover(store.activeIndex)}
                >
                  <Star className="h-3 w-3" />
                  设为封面
                </Button>
                {active && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => copyImagePath(active)}
                    title={`复制图片绝对路径：${active.local_path || active.path}`}
                    aria-label="复制图片绝对路径"
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 flex-1 gap-1 text-[11px] text-destructive hover:text-destructive"
                  onClick={() => store.removeAt(store.activeIndex)}
                >
                  <Trash2 className="h-3 w-3" />
                  移除这张
                </Button>
              </div>
            )}

            {/* 缩略图排序 */}
            {images.length > 0 && (
              <>
                <p className="mt-4 mb-2 text-[11px] text-muted-foreground">
                  拖动缩略图排序 · 第 1 张是封面
                </p>
                {/* 上限 15 张时 3 列要 5 行，限高滚动，别把下面的上传 / 路径按钮顶出屏幕 */}
                <div className="grid max-h-[34vh] grid-cols-3 gap-2 overflow-y-auto pr-0.5">
                  {images.map((img, index) => (
                    <div
                      key={img.path + index}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", String(index));
                        e.currentTarget.classList.add("drag-ghost");
                      }}
                      onDragEnd={(e) => e.currentTarget.classList.remove("drag-ghost")}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const from = Number(e.dataTransfer.getData("text/plain"));
                        store.move(from, index);
                      }}
                      onClick={() => store.setActive(index)}
                      className={cn(
                        "group relative aspect-[3/4] cursor-grab overflow-hidden rounded-lg border bg-muted active:cursor-grabbing",
                        store.activeIndex === index
                          ? "border-primary ring-2 ring-primary/25"
                          : "border-border hover:border-primary/40",
                      )}
                    >
                      <img src={img.url} alt="" className="h-full w-full object-cover" />
                      <span className="absolute top-1 left-1 rounded bg-black/55 px-1 text-[9px] text-white">
                        {index + 1}
                      </span>
                      {index === 0 && (
                        <span className="absolute bottom-1 left-1 rounded bg-lilac px-1 text-[9px] font-medium text-lilac-foreground">
                          封面
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          store.removeAt(index);
                        }}
                        className="absolute top-1 right-1 hidden h-4 w-4 items-center justify-center rounded-full bg-black/60 text-white group-hover:flex"
                        aria-label="移除"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div className="mt-4 space-y-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  if (files.length) uploadMutation.mutate(files);
                  e.target.value = "";
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 w-full gap-1.5 text-[11px]"
                onClick={() => fileRef.current?.click()}
                disabled={uploadMutation.isPending || images.length >= MAX_IMAGES}
              >
                {uploadMutation.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Upload className="h-3 w-3" />
                )}
                上传图片（可多选）
              </Button>

              {pathBoxOpen ? (
                <div className="space-y-1.5">
                  <textarea
                    value={pathText}
                    onChange={(e) => setPathText(e.target.value)}
                    rows={3}
                    placeholder="/Users/you/Pictures/a.png 或 /static/images/xxx.png（每行一个）"
                    className="w-full rounded-lg border border-input bg-background p-2 font-mono text-[11px] outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  />
                  <div className="flex gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 flex-1 text-[11px]"
                      onClick={addByPath}
                      disabled={importLocalMutation.isPending}
                    >
                      {importLocalMutation.isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : null}
                      添加
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-[11px]"
                      onClick={() => setPathBoxOpen(false)}
                    >
                      取消
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-full text-[11px] text-muted-foreground"
                  onClick={() => setPathBoxOpen(true)}
                >
                  或粘贴本地 / 已有图片路径
                </Button>
              )}
            </div>
          </div>
        </Card>

        {/* 右：文案 */}
        <div className="space-y-5">
          <Card className="gap-0 rounded-2xl border-border/70 p-5 shadow-none">
            <div className="space-y-4">
              <form.Field name="title">
                {(field) => (
                  <div className="space-y-1.5">
                    <Label className="text-xs">
                      标题 <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                      placeholder="例：🌊 海边英语｜这 10 个词你会吗？"
                      className="h-10 text-[15px] font-medium"
                    />
                  </div>
                )}
              </form.Field>

              <div className="grid gap-3 sm:grid-cols-3">
                <form.Field name="status">
                  {(field) => (
                    <div className="space-y-1.5">
                      <Label className="text-xs">状态</Label>
                      <Select value={field.state.value} onValueChange={field.handleChange}>
                        <SelectTrigger className="h-9 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CARD_STATUSES.map((s) => (
                            <SelectItem key={s} value={s}>
                              {s}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </form.Field>

                <form.Field name="card_type">
                  {(field) => (
                    <div className="space-y-1.5">
                      <Label className="text-xs">类型</Label>
                      <Select value={field.state.value} onValueChange={field.handleChange}>
                        <SelectTrigger className="h-9 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CARD_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>
                              {t}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </form.Field>

                <form.Field name="theme">
                  {(field) => (
                    <div className="space-y-1.5">
                      <Label className="text-xs">场景主题</Label>
                      <Input
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        placeholder="夏日海边"
                        className="h-9 text-xs"
                      />
                    </div>
                  )}
                </form.Field>
              </div>

              <form.Field name="words">
                {(field) => (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">单词列表</Label>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                        onClick={() => {
                          const words = field.state.value
                            .split(/[,，;；\n]/)
                            .map((w) => w.trim())
                            .filter(Boolean);
                          if (!words.length) return toast.warning("先填几个单词");
                          lookupMutation.mutate(words);
                        }}
                      >
                        {lookupMutation.isPending ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Check className="h-3 w-3" />
                        )}
                        检查词库
                      </button>
                    </div>
                    <textarea
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      rows={2}
                      placeholder="用逗号或换行分隔，例如：breeze, sunrise, wander"
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                    />
                    {missingWords && missingWords.length > 0 && (
                      <p className="text-[11px] text-amber-600">
                        词库里没找到：{missingWords.join("、")}
                      </p>
                    )}
                  </div>
                )}
              </form.Field>

              <form.Field name="story">
                {(field) => (
                  <div className="space-y-1.5">
                    <Label className="text-xs">故事场景描述</Label>
                    <textarea
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      rows={4}
                      placeholder="描述画面：谁、在哪里、光线如何、主体是什么。这段会喂给生图 / 生视频提示词。"
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                    />
                  </div>
                )}
              </form.Field>

              <form.Field name="caption">
                {(field) => (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">发布配文</Label>
                      <span className="tnum text-[11px] text-muted-foreground">
                        {field.state.value.length} 字
                      </span>
                    </div>
                    <textarea
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      rows={7}
                      placeholder="可以直接复制到小红书 / 公众号的文案，结尾带上话题标签。"
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                    />
                  </div>
                )}
              </form.Field>
            </div>
          </Card>

          {/* 提示词 + AI */}
          <Card className="gap-0 rounded-2xl border-border/70 p-5 shadow-none">
            <div className="mb-3 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-lilac" />
              <span className="text-[13px] font-medium">提示词与生成</span>
              <Badge variant="outline" className="ml-auto h-5 text-[10px]">
                槽位自动填充
              </Badge>
            </div>

            <div className="flex flex-wrap gap-2">
              <TemplatePicker
                templates={templates ?? []}
                value={templateId}
                onChange={setTemplateId}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 gap-1.5"
                disabled={!templateId || renderMutation.isPending}
                onClick={() => renderMutation.mutate(templateId)}
              >
                {renderMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Wand2 className="h-3.5 w-3.5" />
                )}
                渲染提示词
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-9 gap-1.5"
                onClick={() => {
                  setAiOpen(true);
                  if (!aiResult) aiMutation.mutate();
                }}
              >
                <Sparkles className="h-3.5 w-3.5" />
                AI 生成文案
              </Button>
            </div>

            {promptText && (
              <div className="mt-3 rounded-xl border bg-muted/40">
                <div className="flex items-center justify-between border-b px-3 py-1.5">
                  <span className="text-[11px] text-muted-foreground">
                    渲染结果 · {promptText.length} 字
                  </span>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                    onClick={() => {
                      navigator.clipboard.writeText(promptText);
                      toast.success("提示词已复制");
                    }}
                  >
                    <Copy className="h-3 w-3" />
                    复制
                  </button>
                </div>
                <pre className="max-h-48 overflow-y-auto px-3 py-2.5 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-foreground/80">
                  {promptText}
                </pre>
              </div>
            )}
          </Card>

          <p className="text-center text-[11px] text-muted-foreground">
            配图顺序即发布顺序，第 1 张会作为列表和工作台的封面。
          </p>
        </div>
      </form>

      {/* AI 结果 */}
      <Dialog open={aiOpen} onOpenChange={setAiOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>AI 生成文案</DialogTitle>
            <DialogDescription>
              用当前场景、单词和模板生成标题 / 画面描述 / 配文。生成后可以再改。
            </DialogDescription>
          </DialogHeader>

          {aiMutation.isPending && (
            <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-4 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              正在生成…
            </div>
          )}

          {aiResult && (
            <div className="space-y-3">
              <div>
                <p className="mb-1 text-[11px] text-muted-foreground">标题</p>
                <p className="text-sm font-medium">{aiResult.title}</p>
              </div>
              <Separator />
              <div>
                <p className="mb-1 text-[11px] text-muted-foreground">画面描述</p>
                <p className="text-sm leading-relaxed">{aiResult.story}</p>
              </div>
              <Separator />
              <div>
                <p className="mb-1 text-[11px] text-muted-foreground">配文</p>
                <p className="max-h-40 overflow-y-auto text-sm leading-relaxed whitespace-pre-wrap">
                  {aiResult.caption}
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAiOpen(false)}>
              关闭
            </Button>
            <Button size="sm" disabled={!aiResult} onClick={applyAi}>
              填入表单
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
