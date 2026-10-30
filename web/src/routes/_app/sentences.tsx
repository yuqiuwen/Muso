import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Copy, Loader2, Quote, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { sentenceApi, type SentenceItem } from "@/lib/api/sentence";
import { PageHeader } from "@/components/page";
import { Pager } from "@/components/pager";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/sentences")({
  head: () => ({ meta: [{ title: "句库 · 妙作 Muso" }] }),
  component: SentencesPage,
});

const WORD_RANGES = [
  { label: "全部长度", min: 0, max: 0 },
  { label: "≤ 8 词", min: 0, max: 8 },
  { label: "9–15 词", min: 9, max: 15 },
  { label: "16–25 词", min: 16, max: 25 },
  { label: "> 25 词", min: 26, max: 0 },
];

function SentencesPage() {
  const [keyword, setKeyword] = useState("");
  const [debounced, setDebounced] = useState("");
  const [source, setSource] = useState("");
  const [rangeIndex, setRangeIndex] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 20;

  const [lookupWord, setLookupWord] = useState("");
  const [lookupResult, setLookupResult] = useState<SentenceItem[] | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(keyword.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [keyword]);

  const range = WORD_RANGES[rangeIndex];

  const { data: sources } = useQuery({
    queryKey: ["sentence-sources"],
    queryFn: () => sentenceApi.sources(),
  });

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["sentences", { debounced, source, rangeIndex, page }],
    queryFn: () =>
      sentenceApi.list({
        keyword: debounced,
        source,
        min_words: range.min,
        max_words: range.max,
        page,
        limit,
      }),
    placeholderData: keepPreviousData,
  });

  const lookupMutation = useMutation({
    mutationFn: (word: string) => sentenceApi.forWord(word, 8),
    onSuccess: (items) => setLookupResult(items),
  });

  const total = sources?.reduce((sum, s) => sum + s.entry_count, 0) ?? 0;

  return (
    <div>
      <PageHeader
        eyebrow="Corpus · 句库"
        title="双语例句"
        description={`${total.toLocaleString()} 条中英对照例句。整词匹配：搜 bet 不会命中 better，短句优先。`}
      />

      {/* 按单词取句 */}
      <Card className="mb-5 gap-0 rounded-2xl border-border/70 bg-gradient-to-br from-secondary/60 to-card p-4 shadow-none">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 text-[13px] font-medium">
            <Sparkles className="h-4 w-4 text-primary" />
            给某个单词找例句
          </div>
          <div className="ml-auto flex flex-1 flex-wrap items-center gap-2 sm:max-w-md">
            <Input
              value={lookupWord}
              onChange={(e) => setLookupWord(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && lookupWord.trim())
                  lookupMutation.mutate(lookupWord.trim());
              }}
              placeholder="输入单词，回车"
              className="h-8 flex-1 text-xs"
            />
            <Button
              size="sm"
              className="h-8"
              disabled={!lookupWord.trim() || lookupMutation.isPending}
              onClick={() => lookupMutation.mutate(lookupWord.trim())}
            >
              {lookupMutation.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              查找
            </Button>
          </div>
        </div>

        {lookupResult && (
          <div className="mt-3 border-t pt-3">
            {lookupResult.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                句库里没有包含「{lookupWord}」的例句。
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {lookupResult.map((s) => (
                  <div
                    key={s.id}
                    className="group flex items-start gap-2 rounded-lg border bg-card/80 p-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] leading-relaxed">{s.en}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{s.zh}</p>
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(`${s.en}\n${s.zh}`);
                        toast.success("已复制");
                      }}
                      className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                      aria-label="复制"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜英文或中文…"
            className="h-9 pl-8"
          />
        </div>

        <Select
          value={source || "__all__"}
          onValueChange={(v) => {
            setSource(v === "__all__" ? "" : v);
            setPage(1);
          }}
        >
          <SelectTrigger className="h-9 w-[170px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">全部来源</SelectItem>
            {sources?.map((s) => (
              <SelectItem key={s.name} value={s.name}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={String(rangeIndex)}
          onValueChange={(v) => {
            setRangeIndex(Number(v));
            setPage(1);
          }}
        >
          <SelectTrigger className="h-9 w-[130px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {WORD_RANGES.map((r, i) => (
              <SelectItem key={r.label} value={String(i)}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {data && <span className="tnum">{data.total.toLocaleString()} 条</span>}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : !data?.items.length ? (
        <EmptyState
          icon={Quote}
          title="没有匹配的例句"
          description="换个关键词，或者放宽词数范围。"
        />
      ) : (
        <div className="space-y-2">
          {data.items.map((s) => (
            <Card
              key={s.id}
              className={cn(
                "group gap-0 rounded-xl border-border/70 p-3.5 shadow-none transition-colors hover:border-primary/25",
              )}
            >
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] leading-relaxed font-medium">{s.en}</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{s.zh}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <span className="tnum text-[10px] text-muted-foreground">{s.word_count} 词</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`${s.en}\n${s.zh}`);
                      toast.success("已复制");
                    }}
                    className="rounded p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-muted"
                    aria-label="复制"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
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
    </div>
  );
}
