import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { BookOpen, Check, Copy, Loader2, Search, Volume2 } from "lucide-react";
import { toast } from "sonner";

import { wordApi, type WordItem } from "@/lib/api/word";
import { copyText } from "@/lib/clipboard";
import { formatWordEntry } from "@/lib/word-format";
import { PageHeader } from "@/components/page";
import { Pager } from "@/components/pager";
import { EmptyState } from "@/components/empty-state";
import { WordMultiSearch } from "@/components/word-multi-search";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/library")({
  head: () => ({ meta: [{ title: "词库 · 妙作 Muso" }] }),
  component: LibraryPage,
});

const LETTERS = ["全部", ..."abcdefghijklmnopqrstuvwxyz".split("")];

type SearchMode = "single" | "multi";

function LibraryPage() {
  const [mode, setMode] = useState<SearchMode>("single");
  const [keyword, setKeyword] = useState("");
  const [debounced, setDebounced] = useState("");
  const [source, setSource] = useState("");
  const [letter, setLetter] = useState("全部");
  const [page, setPage] = useState(1);
  const [active, setActive] = useState<WordItem | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const limit = 20;

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(keyword.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [keyword]);

  useEffect(() => {
    if (copiedId === null) return;
    const timer = setTimeout(() => setCopiedId(null), 1400);
    return () => clearTimeout(timer);
  }, [copiedId]);

  const copyEntry = async (word: WordItem) => {
    const ok = await copyText(formatWordEntry(word));
    if (!ok) {
      toast.error("复制失败，手动选中文本试试");
      return;
    }
    setCopiedId(word.id);
  };

  const { data: sources } = useQuery({
    queryKey: ["word-sources"],
    queryFn: () => wordApi.sources(),
  });

  // 词条去重总数：词典之间的条目会重叠，所以不能把各词典的 entry_count 直接相加
  const { data: stat } = useQuery({
    queryKey: ["words-total"],
    queryFn: () => wordApi.list({ page: 1, limit: 1 }),
    staleTime: 5 * 60 * 1000,
  });

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["words", { debounced, source, letter, page }],
    queryFn: () =>
      wordApi.list({
        keyword: debounced,
        source,
        letter: letter === "全部" ? "" : letter,
        page,
        limit,
      }),
    placeholderData: keepPreviousData,
  });

  const totalWords = stat?.total ?? 0;
  const totalEntries = sources?.reduce((sum, s) => sum + s.entry_count, 0) ?? 0;

  return (
    <div>
      <PageHeader
        eyebrow="Library · 词库"
        title="词库"
        description={`${totalWords.toLocaleString()} 条词条（已去重），来自 ${sources?.length ?? 0} 本词典，累计收录 ${totalEntries.toLocaleString()} 条。音标按「美式优先、英式回落」展示，释义保留原词典排版。`}
      />

      <div className="grid gap-5 lg:grid-cols-[240px_1fr]">
        {/* 词典筛选 */}
        <Card className="gap-0 self-start rounded-2xl border-border/70 p-3 shadow-none lg:sticky lg:top-6">
          <p className="mb-2 px-1 text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
            词典来源
          </p>
          <button
            onClick={() => {
              setSource("");
              setPage(1);
            }}
            className={cn(
              "mb-0.5 flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors",
              source === ""
                ? "bg-secondary font-medium text-secondary-foreground"
                : "hover:bg-muted",
            )}
          >
            <span>全部词典</span>
            <span className="tnum text-[11px] text-muted-foreground">
              {totalWords.toLocaleString()}
            </span>
          </button>
          {sources?.map((s) => (
            <button
              key={s.name}
              onClick={() => {
                setSource(s.name);
                setPage(1);
              }}
              title={s.filename}
              className={cn(
                "mb-0.5 flex w-full items-start justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors",
                source === s.name
                  ? "bg-secondary font-medium text-secondary-foreground"
                  : "hover:bg-muted",
              )}
            >
              <span className="line-clamp-2 leading-snug">{s.name}</span>
              <span className="tnum mt-0.5 shrink-0 text-[11px] text-muted-foreground">
                {s.entry_count.toLocaleString()}
              </span>
            </button>
          ))}
        </Card>

        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <ToggleGroup
              type="single"
              value={mode}
              onValueChange={(value) => value && setMode(value as SearchMode)}
              aria-label="搜索模式"
              className="h-9 shrink-0 gap-0 rounded-full border border-border/70 bg-muted/40 p-0.5"
            >
              <ToggleGroupItem
                value="single"
                className="h-8 gap-1.5 rounded-full px-3 text-[12px] data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-sm"
              >
                单词
              </ToggleGroupItem>
              <ToggleGroupItem
                value="multi"
                className="h-8 gap-1.5 rounded-full px-3 text-[12px] data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-sm"
              >
                多词
              </ToggleGroupItem>
            </ToggleGroup>

            {mode === "single" ? (
              <>
                <div className="relative min-w-[200px] flex-1">
                  <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    placeholder="搜单词或中文释义…"
                    className="h-9 pl-8"
                  />
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  {isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {data && <span className="tnum">{data.total.toLocaleString()} 条</span>}
                </div>
              </>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                一次查多个词，整词精确匹配
                {source && (
                  <>
                    ，当前只看 <span className="text-foreground">{source}</span>
                  </>
                )}
              </p>
            )}
          </div>

          {mode === "multi" ? (
            <WordMultiSearch
              source={source}
              onPick={setActive}
              onSearchSingle={(word) => {
                setMode("single");
                setKeyword(word);
              }}
            />
          ) : (
            <>
              <div className="mb-3 flex flex-wrap gap-1">
                {LETTERS.map((l) => (
                  <button
                    key={l}
                    onClick={() => {
                      setLetter(l);
                      setPage(1);
                    }}
                    className={cn(
                      "h-6 min-w-6 rounded px-1.5 text-[11px] uppercase transition-colors",
                      letter === l
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {l}
                  </button>
                ))}
              </div>

              {isLoading ? (
                <div className="space-y-1.5">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 rounded-xl" />
                  ))}
                </div>
              ) : !data?.items.length ? (
                <EmptyState
                  icon={BookOpen}
                  title="没有匹配的词条"
                  description="换个拼写、去掉词典筛选，或者只搜中文释义试试。"
                />
              ) : (
                <Card className="gap-0 overflow-hidden rounded-2xl border-border/70 p-0 shadow-none">
                  {data.items.map((word, index) => (
                    <div
                      key={word.id}
                      className={cn(
                        "flex items-start gap-3 px-4 py-3 transition-colors hover:bg-accent/40",
                        index > 0 && "border-t border-border/60",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => setActive(word)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="flex flex-wrap items-baseline gap-2">
                          <span className="text-[14px] font-semibold">{word.word}</span>
                          {(word.phonetic_us || word.phonetic_uk) && (
                            <span className="font-mono text-[11.5px] text-muted-foreground">
                              /{word.phonetic_us || word.phonetic_uk}/
                            </span>
                          )}
                          {word.pos && (
                            <Badge variant="outline" className="h-4 px-1 text-[10px]">
                              {word.pos}
                            </Badge>
                          )}
                        </div>
                        <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-muted-foreground">
                          {word.definition || "（这本词典没有释义）"}
                        </p>
                      </button>

                      <div className="flex shrink-0 items-center gap-1.5">
                        <span className="mt-0.5 hidden text-[11px] text-subtle sm:block">
                          {word.source}
                        </span>
                        <button
                          type="button"
                          aria-label={`复制「${word.word}」的英文、音标、释义`}
                          title="复制英文 + 音标 + 中文释义"
                          onClick={() => copyEntry(word)}
                          className={cn(
                            "mt-0.5 grid h-7 w-7 place-items-center rounded-full transition-colors",
                            copiedId === word.id
                              ? "bg-primary/12 text-primary"
                              : "text-muted-foreground/70 hover:bg-accent hover:text-foreground",
                          )}
                        >
                          {copiedId === word.id ? (
                            <Check className="h-3.5 w-3.5" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </Card>
              )}

              {data && data.total > 0 && (
                <Pager
                  page={data.page}
                  pages={data.pages}
                  total={data.total}
                  limit={data.limit}
                  onPage={setPage}
                />
              )}
            </>
          )}
        </div>
      </div>

      <WordSheet word={active} onClose={() => setActive(null)} />
    </div>
  );
}

function WordSheet({ word, onClose }: { word: WordItem | null; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["word", word?.id],
    queryFn: () => wordApi.get(word!.id),
    enabled: !!word,
  });

  return (
    <Sheet open={!!word} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex flex-wrap items-baseline gap-2">
            <span className="text-xl">{word?.word}</span>
            {word?.pos && (
              <Badge variant="outline" className="h-5 text-[10px]">
                {word.pos}
              </Badge>
            )}
          </SheetTitle>
          <SheetDescription>{word?.source}</SheetDescription>

          {/* 复制按钮放头部：释义动辄十几行，放滚动区底部永远够不到 */}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              disabled={!data}
              onClick={async () => {
                if (!data) return;
                const ok = await copyText(formatWordEntry(data));
                if (!ok) {
                  toast.error("复制失败，手动选中文本试试");
                  return;
                }
                toast.success("已复制词条", { description: "英文 + 音标 + 中文释义" });
              }}
            >
              <Copy className="mr-1 h-3.5 w-3.5" />
              复制词条
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8"
              disabled={!data}
              onClick={async () => {
                if (!data) return;
                const ok = await copyText(data.word);
                if (!ok) {
                  toast.error("复制失败，手动选中文本试试");
                  return;
                }
                toast.success("已复制单词", { description: data.word });
              }}
            >
              复制单词
            </Button>
          </div>
        </SheetHeader>

        <ScrollArea className="mt-4 h-[calc(100vh-200px)] pr-3">
          {isLoading && <Skeleton className="h-40 rounded-xl" />}

          {data && (
            <div className="space-y-5">
              <div className="space-y-1.5 rounded-xl bg-muted/50 p-3">
                <div className="flex items-center gap-2 text-[12px]">
                  <span className="w-8 shrink-0 text-muted-foreground">美式</span>
                  <span className="font-mono">
                    {data.phonetic_us ? `/${data.phonetic_us}/` : "—"}
                  </span>
                  {data.phonetic_us && <Volume2 className="h-3 w-3 text-muted-foreground" />}
                </div>
                <div className="flex items-center gap-2 text-[12px]">
                  <span className="w-8 shrink-0 text-muted-foreground">英式</span>
                  <span className="font-mono">
                    {data.phonetic_uk ? `/${data.phonetic_uk}/` : "—"}
                  </span>
                </div>
              </div>

              <div>
                <p className="mb-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  释义
                </p>
                <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{data.definition}</p>
              </div>

              {data.examples.length > 0 && (
                <div>
                  <p className="mb-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                    词典例句
                  </p>
                  <div className="space-y-2.5">
                    {data.examples.map((ex, i) => (
                      <div key={i} className="rounded-lg border border-border/70 p-2.5">
                        <p className="text-[12.5px] leading-relaxed">{ex.en}</p>
                        {ex.zh && (
                          <p className="mt-1 text-[11.5px] text-muted-foreground">{ex.zh}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
