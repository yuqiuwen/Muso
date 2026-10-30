import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, Loader2, Lock, Plus, Search, Sparkles, Trash2, Wand2, X } from "lucide-react";
import { toast } from "sonner";

import { promptApi, type TemplateItem } from "@/lib/api/prompt";
import { PROMPT_KINDS, PROMPT_KIND_STYLE, promptKindLabel } from "@/lib/constant";
import { PageHeader } from "@/components/page";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

const MAX_CHARS = 8000;

/** 筛选条件放 URL，刷新、后退、贴链接都能回到同一屏（和 /cards 一致） */
type PromptsSearch = {
  /** 0 / 缺省表示不按类型筛选 */
  kind?: number;
  keyword?: string;
};

function compactSearch(raw: PromptsSearch): PromptsSearch {
  const out: PromptsSearch = {};
  if (raw.kind && raw.kind > 0) out.kind = Math.floor(raw.kind);
  const keyword = raw.keyword?.trim();
  if (keyword) out.keyword = keyword;
  return out;
}

export const Route = createFileRoute("/_app/prompts")({
  head: () => ({ meta: [{ title: "提示词模板 · 妙作 Muso" }] }),
  validateSearch: (raw: Record<string, unknown>): PromptsSearch => {
    const kind = Number(raw.kind);
    return compactSearch({
      kind: Number.isFinite(kind) ? kind : undefined,
      keyword: typeof raw.keyword === "string" ? raw.keyword : undefined,
    });
  },
  component: PromptsPage,
});

function PromptsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const search = Route.useSearch();
  const kindFilter = search.kind ?? 0;
  const urlKeyword = search.keyword ?? "";

  // 输入框留一份本地态做防抖，停手 300ms 才写进 URL，避免每个字符压一条历史
  const [keyword, setKeyword] = useState(urlKeyword);
  const [editing, setEditing] = useState<TemplateItem | "new" | null>(null);
  const [deleting, setDeleting] = useState<TemplateItem | null>(null);
  const [viewing, setViewing] = useState<TemplateItem | null>(null);

  const patchSearch = useCallback(
    (patch: PromptsSearch, replace = false) => {
      navigate({
        to: "/prompts",
        search: (prev) => compactSearch({ ...prev, ...patch }),
        replace,
      });
    },
    [navigate],
  );

  // 后退/前进把 keyword 改了，输入框要跟着回填
  useEffect(() => setKeyword(urlKeyword), [urlKeyword]);

  useEffect(() => {
    if (keyword.trim() === urlKeyword) return;
    const timer = setTimeout(() => patchSearch({ keyword }, true), 300);
    return () => clearTimeout(timer);
  }, [keyword, urlKeyword, patchSearch]);

  const { data, isLoading } = useQuery({ queryKey: ["prompts"], queryFn: () => promptApi.list() });

  // 按名称过滤（模板总量很小，前端过滤足够，不必再打一次接口）
  const matched = useMemo(() => {
    const q = urlKeyword.toLowerCase();
    if (!q) return data ?? [];
    return (data ?? []).filter((tpl) => tpl.name.toLowerCase().includes(q));
  }, [data, urlKeyword]);

  // 计数跟着搜索结果走：搜索时每个页签显示的是「命中里各类型有多少」
  const counts = useMemo(() => {
    const map: Record<number, number> = {};
    for (const tpl of matched) map[tpl.kind] = (map[tpl.kind] ?? 0) + 1;
    return map;
  }, [matched]);

  const visible = useMemo(
    () => (kindFilter ? matched.filter((tpl) => tpl.kind === kindFilter) : matched),
    [matched, kindFilter],
  );

  // 空状态要分清是「关键词没命中」还是「命中都落在别的类型」，文案和按钮跟着变
  const emptyCopy =
    urlKeyword && !matched.length
      ? {
          title: `没有匹配「${urlKeyword}」的模板`,
          description: "只按模板名称匹配，换个关键词或清空搜索看全部。",
        }
      : urlKeyword
        ? {
            title: `「${urlKeyword}」下没有${promptKindLabel(kindFilter)}类模板`,
            description: "换个类型看看，或者清空搜索重新找。",
          }
        : kindFilter
          ? {
              title: `没有${promptKindLabel(kindFilter)}类模板`,
              description: "换个类型看看，或者把这条模板的类型改过来。",
            }
          : {
              title: "还没有模板",
              description: "把常用的生图 / 生文提示词存成模板，下次直接套用。",
            };

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["prompts"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };

  // 正在搜「海报」时新建模板，名字大概率不匹配，存完会被过滤掉看不见 —— 新建后顺手清空搜索
  const handleSaved = () => {
    invalidate();
    if (editing === "new" && urlKeyword) {
      setKeyword("");
      patchSearch({ keyword: "" }, true);
    }
  };

  const duplicateMutation = useMutation({
    mutationFn: (id: string) => promptApi.duplicate(id),
    onSuccess: () => {
      toast.success("已复制模板");
      invalidate();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => promptApi.remove(id),
    onSuccess: () => {
      toast.success("模板已删除");
      setDeleting(null);
      invalidate();
    },
  });

  return (
    <div>
      <PageHeader
        eyebrow="Prompt · 提示词"
        title="提示词模板"
        description={`模板里用 {{槽位}} 占位，卡片编辑器会自动把标题、场景、单词、故事填进去。单条上限 ${MAX_CHARS.toLocaleString()} 字符。`}
        actions={
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            新建模板
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索模板名称…"
            className="h-9 pr-8 pl-8.5"
          />
          {keyword && (
            <button
              type="button"
              aria-label="清空搜索"
              onClick={() => {
                setKeyword("");
                patchSearch({ keyword: "" }, true);
              }}
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <Tabs value={String(kindFilter)} onValueChange={(v) => patchSearch({ kind: Number(v) })}>
          <TabsList className="h-9">
            <TabsTrigger value="0" className="px-2.5 text-xs">
              全部
              <span className="tnum ml-1 text-muted-foreground">{matched.length}</span>
            </TabsTrigger>
            {PROMPT_KINDS.map((k) => (
              <TabsTrigger key={k.value} value={String(k.value)} className="px-2.5 text-xs">
                {k.label}
                <span className="tnum ml-1 text-muted-foreground">{counts[k.value] ?? 0}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {urlKeyword && (
          <span className="tnum text-[11px] text-muted-foreground">命中 {matched.length} 条</span>
        )}
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-2xl" />
          ))}
        </div>
      ) : !visible.length ? (
        <EmptyState
          icon={Sparkles}
          {...emptyCopy}
          action={
            urlKeyword && !matched.length ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setKeyword("");
                  patchSearch({ keyword: "" }, true);
                }}
              >
                清空搜索
              </Button>
            ) : kindFilter ? (
              <Button size="sm" variant="outline" onClick={() => patchSearch({ kind: 0 })}>
                看全部类型
              </Button>
            ) : (
              <Button size="sm" onClick={() => setEditing("new")}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                新建模板
              </Button>
            )
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((tpl) => (
            <Card
              key={tpl.id}
              className="group flex flex-col gap-0 rounded-2xl border-border/70 p-4 shadow-none transition-shadow hover:shadow-soft"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="line-clamp-1 text-[14px] font-medium">{tpl.name}</p>
                  <p className="mt-1 line-clamp-2 min-h-[32px] text-[11.5px] leading-relaxed text-muted-foreground">
                    {tpl.description || "（没有描述）"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Badge
                    variant="outline"
                    className={cn("h-5 px-1.5 text-[10px]", PROMPT_KIND_STYLE[tpl.kind])}
                  >
                    {promptKindLabel(tpl.kind)}
                  </Badge>
                  {tpl.builtin ? (
                    <Badge variant="outline" className="h-5 gap-1 text-[10px]">
                      <Lock className="h-2.5 w-2.5" />
                      内置
                    </Badge>
                  ) : (
                    <Badge className="h-5 bg-secondary text-[10px] text-secondary-foreground">
                      自建
                    </Badge>
                  )}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-1">
                {tpl.slots.slice(0, 6).map((slot) => (
                  <span
                    key={slot}
                    className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                  >
                    {slot}
                  </span>
                ))}
                {tpl.slots.length > 6 && (
                  <span className="text-[10px] text-muted-foreground">+{tpl.slots.length - 6}</span>
                )}
                {tpl.slots.length === 0 && (
                  <span className="text-[10px] text-muted-foreground">没有槽位，纯文本模板</span>
                )}
              </div>

              <div className="mt-auto flex items-center justify-between pt-4">
                <span className="tnum text-[10.5px] text-muted-foreground">
                  {tpl.chars.toLocaleString()} 字符 · {tpl.updated_at?.slice(5, 16) ?? "—"}
                </span>
                <div className="flex items-center gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    title="查看全文"
                    onClick={() => setViewing(tpl)}
                  >
                    <Wand2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    title="复制一份"
                    onClick={() => duplicateMutation.mutate(tpl.id)}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => setEditing(tpl)}
                  >
                    编辑
                  </Button>
                  {!tpl.builtin && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      title="删除"
                      onClick={() => setDeleting(tpl)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <TemplateDialog
        open={!!editing}
        template={editing === "new" ? null : editing}
        onClose={() => setEditing(null)}
        onSaved={handleSaved}
      />

      <Dialog open={!!viewing} onOpenChange={(v) => !v && setViewing(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{viewing?.name}</DialogTitle>
            <DialogDescription>
              {promptKindLabel(viewing?.kind ?? 1)} · {viewing?.chars.toLocaleString()} 字符 ·{" "}
              {viewing?.slots.length ?? 0} 个槽位
            </DialogDescription>
          </DialogHeader>
          <pre className="max-h-[55vh] overflow-y-auto rounded-xl bg-muted/50 p-4 font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap">
            {viewing?.content}
          </pre>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(viewing?.content ?? "");
                toast.success("已复制全文");
              }}
            >
              <Copy className="mr-1.5 h-3.5 w-3.5" />
              复制全文
            </Button>
            <Button size="sm" onClick={() => setEditing(viewing)}>
              编辑
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除「{deleting?.name}」？</AlertDialogTitle>
            <AlertDialogDescription>删除后无法恢复，内置模板不受影响。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleting && deleteMutation.mutate(deleting.id)}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function TemplateDialog({
  open,
  template,
  onClose,
  onSaved,
}: {
  open: boolean;
  template: TemplateItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");
  const [kind, setKind] = useState<number>(1);

  useEffect(() => {
    if (!open) return;
    setName(template?.name ?? "");
    setDescription(template?.description ?? "");
    setContent(template?.content ?? "");
    setKind(template?.kind ?? 1);
  }, [open, template]);

  const over = content.length > MAX_CHARS;

  const mutation = useMutation({
    mutationFn: () =>
      template
        ? promptApi.update(template.id, { name, description, content, kind })
        : promptApi.create({ name, description, content, kind }),
    onSuccess: () => {
      toast.success(template ? "模板已保存" : "模板已创建");
      onSaved();
      onClose();
    },
  });

  const slots = Array.from(
    new Set(Array.from(content.matchAll(/\{\{\s*([^{}\n]+?)\s*\}\}/g)).map((m) => m[1])),
  );

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{template ? "编辑模板" : "新建模板"}</DialogTitle>
          <DialogDescription>
            用 <code className="rounded bg-muted px-1 text-[11px]">{"{{单词列表}}"}</code>{" "}
            这类槽位占位， 卡片编辑器会自动填充。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">类型</Label>
            <ToggleGroup
              type="single"
              value={String(kind)}
              onValueChange={(v) => v && setKind(Number(v))}
              aria-label="模板类型"
              className="h-9 w-fit gap-0 rounded-full border border-border/70 bg-muted/40 p-0.5"
            >
              {PROMPT_KINDS.map((k) => (
                <ToggleGroupItem
                  key={k.value}
                  value={String(k.value)}
                  title={k.hint}
                  className="h-8 rounded-full px-3.5 text-[12px] data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-sm"
                >
                  {k.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">名称</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">描述</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="一句话说明这个模板适合什么场景"
                className="h-9 text-sm"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">模板内容</Label>
              <span
                className={cn(
                  "tnum text-[11px]",
                  over ? "font-medium text-destructive" : "text-muted-foreground",
                )}
              >
                {content.length.toLocaleString()} / {MAX_CHARS.toLocaleString()}
              </span>
            </div>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={14}
              spellCheck={false}
              placeholder="你是一名插画师…&#10;主题：{{场景主题}}&#10;单词：{{单词列表}}"
              className={cn(
                "w-full rounded-lg border bg-background p-3 font-mono text-[12px] leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                over ? "border-destructive" : "border-input",
              )}
            />
            {over && (
              <p className="text-[11px] text-destructive">
                超出上限 {(content.length - MAX_CHARS).toLocaleString()} 字符，请精简后再保存。
              </p>
            )}
          </div>

          {slots.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">识别到槽位：</span>
              {slots.map((s) => (
                <span
                  key={s}
                  className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-secondary-foreground"
                >
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            取消
          </Button>
          <Button
            size="sm"
            disabled={!name.trim() || !content.trim() || over || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
