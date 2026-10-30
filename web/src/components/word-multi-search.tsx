import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Check, Copy, Loader2, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { wordApi, type WordItem } from "@/lib/api/word";
import { copyText } from "@/lib/clipboard";
import {
  formatWordEntry,
  pickPrimaryEntry,
  toChineseDefinition,
  wordPhonetic,
} from "@/lib/word-format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

/** 与后端 `split_words` 同一套分隔符，仅用于「已输入 N 个词」的即时提示 */
const SPLIT_RE = /[,，;；、\n\r\t]+/;

function parseWords(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(SPLIT_RE)) {
    const word = raw.trim();
    const key = word.toLowerCase();
    if (word && !seen.has(key)) {
      seen.add(key);
      out.push(word);
    }
  }
  return out;
}

interface WordMultiSearchProps {
  source: string;
  /** 点某行 → 打开词条详情 */
  onPick: (word: WordItem) => void;
  /** 未收录的词 → 回到单词模式按关键词搜 */
  onSearchSingle: (word: string) => void;
}

export function WordMultiSearch({ source, onPick, onSearchSingle }: WordMultiSearchProps) {
  const [text, setText] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  // 输入停顿 500ms 自动查一次，省得每次都点按钮；回车立即查
  useEffect(() => {
    const timer = setTimeout(() => setSubmitted(text.trim()), 500);
    return () => clearTimeout(timer);
  }, [text]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(null), 1400);
    return () => clearTimeout(timer);
  }, [copied]);

  const { data, isFetching } = useQuery({
    queryKey: ["word-multi", submitted, source],
    queryFn: () => wordApi.multi({ text: submitted, source }),
    enabled: !!submitted,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  const typed = parseWords(text);
  const items = submitted ? (data?.items ?? []) : [];
  const entries = items
    .map((item) => pickPrimaryEntry(item.entries))
    .filter((entry): entry is WordItem => !!entry);

  const copyOne = async (entry: WordItem) => {
    const ok = await copyText(formatWordEntry(entry));
    if (!ok) {
      toast.error("复制失败，手动选中文本试试");
      return;
    }
    setCopied(entry.word);
  };

  const copyAll = async () => {
    if (!entries.length) return;
    const ok = await copyText(entries.map((entry) => formatWordEntry(entry)).join("\n"));
    if (!ok) {
      toast.error("复制失败，手动选中文本试试");
      return;
    }
    toast.success(`已复制 ${entries.length} 个词条`, {
      description: "英文 + 音标 + 中文释义，每行一条",
    });
  };

  return (
    <div className="space-y-3">
      <Card className="gap-0 rounded-2xl border-border/70 p-3 shadow-none">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              setSubmitted(text.trim());
            }
          }}
          rows={3}
          placeholder={"多个单词用逗号隔开，例如：\nabandon, ability, abstract, absorb, accurate"}
          className="min-h-[72px] resize-y text-[13px] leading-relaxed"
        />

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border/60 pt-2.5">
          <span className="text-[11px] text-muted-foreground">
            {typed.length ? (
              <>
                已输入 <span className="tnum font-medium text-foreground">{typed.length}</span> 个词
              </>
            ) : (
              "逗号 / 分号 / 换行都能分隔，回车查询"
            )}
          </span>

          {submitted && data && (
            <span className="tnum text-[11px] text-muted-foreground">
              命中 {data.found} / {data.total}
              {data.missing.length > 0 && (
                <span className="text-warning"> · {data.missing.length} 个未收录</span>
              )}
            </span>
          )}

          <div className="ml-auto flex items-center gap-1.5">
            {isFetching && (
              <Loader2 className="mr-0.5 h-3.5 w-3.5 animate-spin text-muted-foreground" />
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8"
              disabled={!entries.length}
              onClick={copyAll}
            >
              <Copy className="mr-1 h-3.5 w-3.5" />
              复制全部
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8"
              disabled={!typed.length || isFetching}
              onClick={() => setSubmitted(text.trim())}
            >
              <Search className="mr-1 h-3.5 w-3.5" />
              查询
            </Button>
          </div>
        </div>
      </Card>

      {!submitted ? (
        <Card className="gap-0 rounded-2xl border-dashed border-border/70 bg-card/50 p-5 shadow-none">
          <div className="flex items-start gap-2.5">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div className="space-y-1 text-[12.5px] leading-relaxed text-muted-foreground">
              <p className="font-medium text-foreground">一次查一批词，整词精确匹配</p>
              <p>
                释义只取中文，右侧图标复制「英文 + 音标 + 释义」。搜 bet 不会命中
                better；没收录的词会单独标出来。
              </p>
            </div>
          </div>
        </Card>
      ) : !data ? (
        <div className="space-y-1.5">
          {Array.from({ length: Math.min(typed.length || 4, 8) }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      ) : (
        <Card className="gap-0 overflow-hidden rounded-2xl border-border/70 p-0 shadow-none">
          <div className="flex items-center justify-between gap-2 border-b border-border/60 bg-muted/30 px-4 py-2">
            <p className="text-[11px] font-medium tracking-[0.12em] text-muted-foreground uppercase">
              查询结果
            </p>
            <p className="tnum text-[11px] text-muted-foreground">
              {data.found} 命中 · {data.missing.length} 未收录
              {data.truncated && " · 只查了前 50 个"}
            </p>
          </div>

          {items.map((item, index) => {
            const entry = pickPrimaryEntry(item.entries);
            const phonetic = entry ? wordPhonetic(entry) : "";

            return (
              <div
                key={`${item.word}-${index}`}
                className={cn(
                  "group flex items-start gap-3 px-4 py-3 transition-colors",
                  item.found ? "hover:bg-accent/40" : "bg-muted/20",
                  index > 0 && "border-t border-border/60",
                )}
              >
                {item.found && entry ? (
                  <>
                    <button
                      type="button"
                      onClick={() => onPick(entry)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="text-[14px] font-semibold">{entry.word}</span>
                        {phonetic && (
                          <span className="font-mono text-[11.5px] text-muted-foreground">
                            /{phonetic}/
                          </span>
                        )}
                        {entry.pos && (
                          <Badge variant="outline" className="h-4 px-1 text-[10px]">
                            {entry.pos}
                          </Badge>
                        )}
                        {item.entries.length > 1 && (
                          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            +{item.entries.length - 1} 本词典
                          </span>
                        )}
                      </div>
                      <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-muted-foreground">
                        {toChineseDefinition(entry.definition) ||
                          entry.definition ||
                          "（这本词典没有释义）"}
                      </p>
                    </button>

                    <button
                      type="button"
                      aria-label={`复制「${entry.word}」的英文、音标、释义`}
                      title="复制英文 + 音标 + 中文释义"
                      onClick={() => copyOne(entry)}
                      className={cn(
                        "mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full transition-colors",
                        copied === entry.word
                          ? "bg-primary/12 text-primary"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground",
                      )}
                    >
                      {copied === entry.word ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </>
                ) : (
                  <>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="text-[14px] font-semibold text-muted-foreground">
                          {item.word}
                        </span>
                        <Badge
                          variant="outline"
                          className="h-4 border-warning/40 px-1 text-[10px] text-warning"
                        >
                          未收录
                        </Badge>
                      </div>
                      <p className="mt-1 text-[12px] text-subtle">
                        词库里没有这个词的独立词条，换个拼写或查原形试试。
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onSearchSingle(item.word)}
                      className="mt-0.5 shrink-0 rounded-full px-2.5 py-1 text-[11px] text-primary transition-colors hover:bg-primary/10"
                    >
                      在词库里搜
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
