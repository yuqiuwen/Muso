import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Images,
  Loader2,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Trash2,
  Upload,
  Eye,
  FileJson,
} from "lucide-react";
import { toast } from "sonner";

import { cardApi, type CardItem } from "@/lib/api/card";
import { StatusBadge } from "@/components/status-badge";
import { ImageCarousel, type CarouselImage } from "@/components/image-carousel";
import { PageHeader } from "@/components/page";
import { MAX_CARD_IMAGES } from "@/lib/constant";
import { Pager } from "@/components/pager";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CARD_STATUSES } from "@/lib/constant";
import { cn } from "@/lib/utils";

const ALL = "全部";
const PAGE_SIZE = 12;

/**
 * 列表的筛选条件放在 URL 里，而不是组件 state。
 *
 * 编辑器是独立路由（`/cards/$cardId`），进编辑器时列表会被卸载；条件只存在
 * state 里的话，返回列表就全没了、页码也被重置回第一页。放进 search 之后，
 * 返回、刷新、直接贴链接都能回到同一屏。
 */
type CardsSearch = {
  page?: number;
  status?: string;
  theme?: string;
  keyword?: string;
};

/** 只保留非默认值，URL 干净一点：`/cards?page=3&status=草稿` */
function compactSearch(raw: CardsSearch): CardsSearch {
  const out: CardsSearch = {};
  if (raw.page && raw.page > 1) out.page = Math.floor(raw.page);
  if (raw.status && raw.status !== ALL) out.status = raw.status;
  if (raw.theme && raw.theme !== ALL) out.theme = raw.theme;
  const keyword = raw.keyword?.trim();
  if (keyword) out.keyword = keyword;
  return out;
}

export const Route = createFileRoute("/_app/cards")({
  head: () => ({ meta: [{ title: "图文卡片 · 妙作 Muso" }] }),
  validateSearch: (raw: Record<string, unknown>): CardsSearch => {
    const page = Number(raw.page);
    return compactSearch({
      page: Number.isFinite(page) ? page : undefined,
      status: typeof raw.status === "string" ? raw.status : undefined,
      theme: typeof raw.theme === "string" ? raw.theme : undefined,
      keyword: typeof raw.keyword === "string" ? raw.keyword : undefined,
    });
  },
  component: CardsPage,
});

function CardsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const search = Route.useSearch();
  const page = search.page ?? 1;
  const status = search.status ?? ALL;
  const theme = search.theme ?? ALL;
  const urlKeyword = search.keyword ?? "";

  // 输入框留一份本地态做防抖，停手 300ms 才写进 URL，避免每个字符压一条历史
  const [keyword, setKeyword] = useState(urlKeyword);
  const [preview, setPreview] = useState<CardItem | null>(null);
  const [deleting, setDeleting] = useState<CardItem | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importErrors, setImportErrors] = useState<string[]>([]);

  const patchSearch = useCallback(
    (patch: CardsSearch, replace = false) => {
      navigate({
        to: "/cards",
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
    const timer = setTimeout(() => patchSearch({ keyword, page: 1 }, true), 300);
    return () => clearTimeout(timer);
  }, [keyword, urlKeyword, patchSearch]);

  const { data: themes } = useQuery({
    queryKey: ["card-themes"],
    queryFn: () => cardApi.themes("image"),
  });

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["cards", { keyword: urlKeyword, status, theme, page, limit: PAGE_SIZE }],
    queryFn: () =>
      cardApi.list({
        keyword: urlKeyword,
        status: status === ALL ? "" : status,
        theme: theme === ALL ? "" : theme,
        module: "image",
        page,
        limit: PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["cards"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["card-themes"] });
  };

  const statusMutation = useMutation({
    mutationFn: ({ id, next }: { id: number; next: string }) =>
      cardApi.setStatus(id, next as never),
    onSuccess: (_, vars) => {
      toast.success(`已改为「${vars.next}」`);
      invalidate();
    },
  });

  const pinMutation = useMutation({
    mutationFn: (id: number) => cardApi.togglePin(id),
    onSuccess: (card) => {
      toast.success(card.is_pinned ? "已置顶" : "已取消置顶");
      invalidate();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => cardApi.remove(id),
    onSuccess: () => {
      toast.success("卡片已删除");
      setDeleting(null);
      invalidate();
    },
  });

  const importMutation = useMutation({
    mutationFn: (text: string) => cardApi.importJson(text),
    onSuccess: (result) => {
      setImportErrors(result.errors);
      if (result.created.length) {
        toast.success(`成功导入 ${result.created.length} 张卡片`);
        setImportText("");
        invalidate();
        if (!result.errors.length) setImportOpen(false);
      } else {
        toast.error("没有导入任何卡片，请检查 JSON");
      }
    },
  });

  const items = data?.items ?? [];
  const stats = useMemo(() => {
    const total = data?.total ?? 0;
    return { total };
  }, [data?.total]);

  return (
    <div>
      <PageHeader
        eyebrow="Image · 图文"
        title="图文卡片"
        description={`共 ${stats.total} 张卡片。词库挑词、模板出提示词，一张卡片可以挂 ${MAX_CARD_IMAGES} 张配图，顺序就是发布顺序。`}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <FileJson className="mr-1.5 h-3.5 w-3.5" />
              JSON 导入
            </Button>
            <Button asChild size="sm">
              <Link to="/cards/new">
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                新建卡片
              </Link>
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索标题、场景、配文…"
            className="h-9 pl-8.5"
          />
        </div>

        <Tabs value={status} onValueChange={(v) => patchSearch({ status: v, page: 1 })}>
          <TabsList className="h-9">
            {[ALL, ...CARD_STATUSES].map((s) => (
              <TabsTrigger key={s} value={s} className="px-2.5 text-xs">
                {s}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <Select value={theme} onValueChange={(v) => patchSearch({ theme: v, page: 1 })}>
          <SelectTrigger className="h-9 w-[150px] text-xs">
            <SelectValue placeholder="场景" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>全部场景</SelectItem>
            {themes?.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-[300px] rounded-2xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Images}
          title="没有找到卡片"
          description={
            urlKeyword || status !== ALL || theme !== ALL
              ? "换个关键词或筛选条件试试。"
              : "从新建一张图文卡片开始，把词库里的词变成可以发布的画面。"
          }
          action={
            <Button asChild size="sm">
              <Link to="/cards/new">
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                新建卡片
              </Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {items.map((card) => (
              <CardRow
                key={card.id}
                card={card}
                onPreview={() => setPreview(card)}
                onEdit={() =>
                  navigate({ to: "/cards/$cardId", params: { cardId: String(card.id) } })
                }
                onStatus={(next) => statusMutation.mutate({ id: card.id, next })}
                onPin={() => pinMutation.mutate(card.id)}
                onDelete={() => setDeleting(card)}
              />
            ))}
          </div>
          <Pager
            page={data?.page ?? 1}
            pages={data?.pages ?? 1}
            total={data?.total ?? 0}
            limit={PAGE_SIZE}
            onPage={(next) => patchSearch({ page: next })}
          />
        </>
      )}

      {/* 预览 */}
      <Dialog open={!!preview} onOpenChange={(v) => !v && setPreview(null)}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-3xl">
          {preview && <CardPreview key={preview.id} card={preview} />}
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <AlertDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除「{deleting?.title}」？</AlertDialogTitle>
            <AlertDialogDescription>
              卡片和它的配图记录会一起删掉，这个操作不可撤销。
            </AlertDialogDescription>
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

      {/* JSON 导入 */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>JSON 批量导入</DialogTitle>
            <DialogDescription>
              顶层是数组就建多张、是对象就建一张。支持{" "}
              <code className="rounded bg-muted px-1 text-[11px]">title</code> /{" "}
              <code className="rounded bg-muted px-1 text-[11px]">words</code> /{" "}
              <code className="rounded bg-muted px-1 text-[11px]">images</code> /{" "}
              <code className="rounded bg-muted px-1 text-[11px]">content</code>，也认中文{" "}
              <code className="rounded bg-muted px-1 text-[11px]">
                标题 / 单词 / 图片列表 / 配文
              </code>
              {"。只有 "}
              <code className="rounded bg-muted px-1 text-[11px]">title</code>
              {"（标题）必填，其余字段缺省按空处理。"}
            </DialogDescription>
          </DialogHeader>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            rows={12}
            spellCheck={false}
            placeholder={'[{"标题": "海边的风", "单词": "breeze, sunrise", "配文": "..."}]'}
            className="w-full rounded-lg border border-input bg-background p-3 font-mono text-xs leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          />
          {importErrors.length > 0 && (
            <div className="max-h-28 overflow-y-auto rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[11px] text-amber-800">
              {importErrors.map((e, i) => (
                <p key={i}>· {e}</p>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setImportOpen(false)}>
              取消
            </Button>
            <Button
              size="sm"
              disabled={!importText.trim() || importMutation.isPending}
              onClick={() => importMutation.mutate(importText)}
            >
              {importMutation.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              导入
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CardRow({
  card,
  onPreview,
  onEdit,
  onStatus,
  onPin,
  onDelete,
}: {
  card: CardItem;
  onPreview: () => void;
  onEdit: () => void;
  onStatus: (next: string) => void;
  onPin: () => void;
  onDelete: () => void;
}) {
  return (
    <Card className="group gap-0 overflow-hidden rounded-2xl border-border/70 p-0 shadow-none transition-shadow hover:shadow-soft">
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        {card.cover ? (
          <img
            src={card.cover}
            alt={card.title}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-1.5 text-muted-foreground/40">
            <Images className="h-6 w-6" />
            <span className="text-[11px]">还没有配图</span>
          </div>
        )}
        <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
          <StatusBadge status={card.status} className="bg-background/90 backdrop-blur" />
          {card.is_pinned && (
            <Badge className="h-5 gap-1 bg-lilac/90 px-1.5 text-[10px] text-lilac-foreground">
              <Pin className="h-2.5 w-2.5" />
              置顶
            </Badge>
          )}
        </div>
        <div className="absolute inset-x-0 bottom-0 flex justify-end bg-gradient-to-t from-black/45 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
          <Button
            size="sm"
            variant="secondary"
            className="h-7 gap-1 px-2 text-[11px]"
            onClick={onPreview}
          >
            <Eye className="h-3 w-3" />
            预览
          </Button>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-3.5">
        <div className="flex items-start justify-between gap-2">
          <button onClick={onEdit} className="min-w-0 flex-1 text-left">
            <p className="line-clamp-1 text-[13.5px] font-medium hover:text-primary">
              {card.title}
            </p>
            <p className="mt-1 line-clamp-1 text-[11px] text-muted-foreground">
              {card.theme || "未设置场景"}
            </p>
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="mr-2 h-3.5 w-3.5" />
                编辑
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onPin}>
                {card.is_pinned ? (
                  <PinOff className="mr-2 h-3.5 w-3.5" />
                ) : (
                  <Pin className="mr-2 h-3.5 w-3.5" />
                )}
                {card.is_pinned ? "取消置顶" : "置顶"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[10px] font-normal text-muted-foreground">
                改状态
              </DropdownMenuLabel>
              {CARD_STATUSES.filter((s) => s !== card.status).map((s) => (
                <DropdownMenuItem key={s} onClick={() => onStatus(s)}>
                  {s}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={onDelete}
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                删除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="mt-auto flex items-center gap-2 pt-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Images className="h-3 w-3" />
            {card.image_count}
          </span>
          <span className="text-border">|</span>
          <span className={cn("truncate", card.words.length > 0 && "text-foreground/70")}>
            {card.words.length ? card.words.slice(0, 3).join(" · ") : "未设置单词"}
            {card.words.length > 3 && " …"}
          </span>
        </div>
      </div>
    </Card>
  );
}

function CardPreview({ card }: { card: CardItem }) {
  // 列表接口只给封面，左右切换要完整配图列表，所以按 id 补一次详情（已缓存过就直接命中）
  const { data: detail } = useQuery({
    queryKey: ["card", card.id],
    queryFn: () => cardApi.get(card.id),
    staleTime: 30_000,
  });
  const [index, setIndex] = useState(0);

  const images = useMemo<CarouselImage[]>(() => {
    if (detail?.images?.length) return detail.images.map((i) => ({ url: i.url, path: i.path }));
    // 详情还没回来时先用封面顶上，避免闪一下空白
    return card.cover ? [{ url: card.cover }] : [];
  }, [detail, card.cover]);

  return (
    <>
      <DialogHeader>
        <DialogTitle className="pr-6 text-left">{card.title}</DialogTitle>
        <DialogDescription className="text-left">
          {card.theme || card.card_type} · {card.image_count} 张配图 · {card.words.length} 个词
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 sm:grid-cols-[240px_1fr]">
        <div className="relative aspect-[3/4] overflow-hidden rounded-xl border bg-muted">
          {images.length > 0 ? (
            <ImageCarousel
              images={images}
              index={index}
              onIndexChange={setIndex}
              imgClassName="object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              无配图
            </div>
          )}
        </div>
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            <StatusBadge status={card.status} />
            <Badge variant="outline" className="h-5 text-[10px]">
              {card.card_type}
            </Badge>
          </div>
          {card.words.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {card.words.slice(0, 18).map((w) => (
                <span
                  key={w}
                  className="rounded-md bg-secondary px-1.5 py-0.5 text-[11px] text-secondary-foreground"
                >
                  {w}
                </span>
              ))}
              {card.words.length > 18 && (
                <span className="text-[11px] text-muted-foreground">+{card.words.length - 18}</span>
              )}
            </div>
          )}
          <div className="max-h-64 overflow-y-auto rounded-lg bg-muted/50 p-3">
            <p className="text-xs leading-relaxed whitespace-pre-wrap text-foreground/85">
              {card.caption || "还没有配文"}
            </p>
          </div>
        </div>
      </div>
      <DialogFooter className="sm:justify-start">
        <Button asChild size="sm">
          <Link to="/cards/$cardId" params={{ cardId: String(card.id) }}>
            <Pencil className="mr-1.5 h-3.5 w-3.5" />
            编辑这张卡片
          </Link>
        </Button>
      </DialogFooter>
    </>
  );
}
