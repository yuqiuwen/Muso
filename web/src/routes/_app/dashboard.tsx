import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BookOpen,
  Clapperboard,
  Images,
  Music,
  Plus,
  Quote,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

import { dashboardApi } from "@/lib/api/dashboard";
import { StatusBadge } from "@/components/status-badge";
import { SectionTitle } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MODULES } from "@/lib/constant";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({ meta: [{ title: "工作台 · 妙作 Muso" }] }),
  component: DashboardPage,
});

const MODULE_ICON: Record<string, LucideIcon> = {
  image: Images,
  video: Clapperboard,
  music: Music,
};

const QUICK_LINKS = [
  { to: "/library", label: "查词库", hint: "13.5 万词条", icon: BookOpen },
  { to: "/sentences", label: "找例句", hint: "5.9 万双语句", icon: Quote },
  { to: "/prompts", label: "用模板", hint: "槽位自动填充", icon: Sparkles },
] as const;

function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => dashboardApi.overview(),
  });

  return (
    <div className="space-y-8">
      {/* Hero */}
      <section
        className="relative overflow-hidden rounded-3xl border border-primary/20 px-6 py-8 text-white sm:px-9 sm:py-10"
        style={{ backgroundImage: "var(--gradient-hero)" }}
      >
        <div className="pointer-events-none absolute inset-0 bg-grid opacity-[0.07]" />
        <div className="pointer-events-none absolute -top-20 -right-10 h-64 w-64 rounded-full bg-lilac/25 blur-3xl" />
        <div className="relative flex flex-col gap-7 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 max-w-xl">
            <p className="text-[11px] font-medium tracking-[0.2em] text-lilac uppercase">
              Muso Workspace
            </p>
            <h1 className="mt-3 text-[26px] leading-tight font-semibold tracking-tight text-balance text-white sm:text-[32px]">
              今天想创作什么？
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-pretty text-white/70">
              从词库挑词、句库取例，到模板渲染提示词、AI 生成文案，最后收进一张卡片。
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Button
                asChild
                size="sm"
                className="bg-lilac text-lilac-foreground hover:bg-lilac/90"
              >
                <Link to="/cards/new">
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  新建图文卡片
                </Link>
              </Button>
              <Button
                asChild
                size="sm"
                variant="outline"
                className="border-white/25 bg-white/5 text-white hover:bg-white/10 hover:text-white"
              >
                <Link to="/cards">浏览全部内容</Link>
              </Button>
            </div>
          </div>

          <div className="grid w-full shrink-0 grid-cols-3 gap-2.5 sm:w-[380px]">
            {MODULES.map((m) => {
              const Icon = MODULE_ICON[m.key];
              const stat = data?.modules.find((x) => x.module === m.key);
              return (
                <Link
                  key={m.key}
                  to={m.enabled ? "/cards" : m.key === "video" ? "/video" : "/music"}
                  className={cn(
                    "group rounded-2xl border border-white/12 bg-white/5 p-3 transition-colors",
                    m.enabled ? "hover:border-lilac/60 hover:bg-white/10" : "opacity-70",
                  )}
                >
                  <Icon className="h-4 w-4 text-lilac" />
                  <p className="mt-2 text-sm font-medium">{m.label}</p>
                  <p className="mt-0.5 text-[11px] text-white/50">
                    {m.enabled ? `${stat?.total ?? 0} 张卡片` : "开发中"}
                  </p>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[104px] rounded-2xl" />
            ))
          : data?.stats.map((stat) => (
              <Card key={stat.label} className="gap-0 rounded-2xl border-border/70 p-4 shadow-none">
                <p className="text-xs text-muted-foreground">{stat.label}</p>
                <p className="tnum mt-1.5 text-[26px] leading-none font-semibold tracking-tight">
                  {stat.value.toLocaleString()}
                </p>
                <p className="mt-2 truncate text-[11px] text-muted-foreground">{stat.hint}</p>
              </Card>
            ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        {/* 最近编辑 */}
        <section>
          <SectionTitle
            title="最近编辑"
            hint="按更新时间排序"
            action={
              <Button asChild variant="ghost" size="sm" className="h-7 gap-1 text-xs">
                <Link to="/cards">
                  全部 <ArrowRight className="h-3 w-3" />
                </Link>
              </Button>
            }
          />
          <div className="grid gap-3 sm:grid-cols-2">
            {isLoading &&
              Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-[88px] rounded-2xl" />
              ))}
            {data?.recent_cards.slice(0, 4).map((card) => (
              <Link
                key={card.id}
                to="/cards/$cardId"
                params={{ cardId: String(card.id) }}
                className="group flex gap-3 rounded-2xl border border-border/70 bg-card p-2.5 transition-colors hover:border-primary/30"
              >
                <div className="h-[68px] w-[54px] shrink-0 overflow-hidden rounded-lg bg-muted">
                  {card.cover ? (
                    <img
                      src={card.cover}
                      alt=""
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground/40">
                      <Images className="h-4 w-4" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1 py-0.5">
                  <p className="truncate text-[13px] font-medium">{card.title}</p>
                  <p className="mt-1 truncate text-[11px] text-muted-foreground">
                    {card.theme || card.card_type}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <StatusBadge status={card.status} />
                    <span className="text-[11px] text-muted-foreground">
                      {card.image_count} 图 · {card.words.length} 词
                    </span>
                  </div>
                </div>
              </Link>
            ))}
            {!isLoading && data?.recent_cards.length === 0 && (
              <p className="col-span-full rounded-2xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                还没有卡片，从「新建图文卡片」开始吧
              </p>
            )}
          </div>
        </section>

        {/* 右栏 */}
        <div className="space-y-6">
          <section>
            <SectionTitle title="内容分布" hint="图文模块" />
            <Card className="gap-0 rounded-2xl border-border/70 p-4 shadow-none">
              {(["草稿", "待发布", "已上架", "已下架"] as const).map((status) => {
                const count = data?.status_counts?.[status] ?? 0;
                const total =
                  Object.values(data?.status_counts ?? {}).reduce((a, b) => a + b, 0) || 1;
                return (
                  <div key={status} className="mb-3 last:mb-0">
                    <div className="mb-1.5 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{status}</span>
                      <span className="tnum font-medium">{count}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          status === "已上架"
                            ? "bg-sky-500"
                            : status === "待发布"
                              ? "bg-amber-500"
                              : status === "已下架"
                                ? "bg-red-400"
                                : "bg-zinc-300 dark:bg-zinc-600",
                        )}
                        style={{ width: `${Math.max((count / total) * 100, count ? 6 : 0)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </Card>
          </section>

          <section>
            <SectionTitle title="快捷入口" />
            <div className="space-y-2">
              {QUICK_LINKS.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className="flex items-center gap-3 rounded-xl border border-border/70 bg-card px-3.5 py-3 transition-colors hover:border-primary/30 hover:bg-accent/40"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary text-primary">
                    <item.icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium">{item.label}</p>
                    <p className="text-[11px] text-muted-foreground">{item.hint}</p>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/50" />
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
