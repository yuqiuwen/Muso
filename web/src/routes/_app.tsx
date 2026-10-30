import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  BookOpen,
  Clapperboard,
  Images,
  LayoutDashboard,
  Menu,
  Music,
  PanelLeftClose,
  PanelLeftOpen,
  Quote,
  Sparkles,
  X,
} from "lucide-react";
import { useState } from "react";

import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  soon?: boolean;
};

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "总览",
    items: [{ to: "/dashboard", label: "工作台", icon: LayoutDashboard }],
  },
  {
    title: "内容创作",
    items: [
      { to: "/cards", label: "图文", icon: Images },
      { to: "/video", label: "视频", icon: Clapperboard, soon: true },
      { to: "/music", label: "音乐", icon: Music, soon: true },
    ],
  },
  {
    title: "素材库",
    items: [
      { to: "/library", label: "词库", icon: BookOpen },
      { to: "/sentences", label: "句库", icon: Quote },
      { to: "/prompts", label: "提示词", icon: Sparkles },
    ],
  },
];

function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="flex min-h-screen bg-background">
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed top-0 left-0 z-40 flex h-screen flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width,transform] duration-200 lg:sticky",
          collapsed ? "lg:w-[72px]" : "lg:w-60",
          "w-60",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        <div
          className={cn(
            "flex h-16 shrink-0 items-center border-b border-sidebar-border",
            collapsed ? "lg:justify-center lg:px-2 px-5" : "px-5",
          )}
        >
          <Link to="/dashboard" className="flex min-w-0 items-center" aria-label="妙作 Muso 工作台">
            <Logo
              tone="sidebar"
              markClassName="h-9"
              showWordmark={!collapsed}
              subtitle="内容创作工作台"
            />
          </Link>
          <button
            className="ml-auto p-1 text-sidebar-foreground/70 lg:hidden"
            onClick={() => setMobileOpen(false)}
            aria-label="关闭菜单"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.title}>
              <p
                className={cn(
                  "mb-1.5 px-3 text-[10px] font-medium tracking-[0.16em] text-sidebar-foreground/40 uppercase",
                  collapsed && "lg:hidden",
                )}
              >
                {group.title}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const active = pathname === item.to || pathname.startsWith(item.to + "/");
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={() => setMobileOpen(false)}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                        active
                          ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                          : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                        collapsed && "lg:justify-center lg:px-0",
                      )}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span className={cn("truncate", collapsed && "lg:hidden")}>{item.label}</span>
                      {item.soon && (
                        <span
                          className={cn(
                            "ml-auto rounded-full bg-sidebar-foreground/10 px-1.5 py-0.5 text-[10px] text-sidebar-foreground/50",
                            collapsed && "lg:hidden",
                          )}
                        >
                          开发中
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div
          className={cn(
            "flex shrink-0 items-center gap-1.5 border-t border-sidebar-border p-3",
            collapsed ? "lg:flex-col" : "justify-between",
          )}
        >
          <div className={cn("min-w-0 flex-1", collapsed && "lg:hidden")}>
            <p className="truncate text-[11px] text-sidebar-foreground/50">妙作 Muso · v0.1</p>
            <p className="truncate text-[11px] text-sidebar-foreground/35">图文 / 视频 / 音乐</p>
          </div>
          <div className={cn("flex items-center gap-1", collapsed && "lg:flex-col")}>
            <ThemeToggle className="text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCollapsed((c) => !c)}
              className="hidden h-8 w-8 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground lg:inline-flex"
              aria-label={collapsed ? "展开菜单" : "收起菜单"}
            >
              {collapsed ? (
                <PanelLeftOpen className="h-4 w-4" />
              ) : (
                <PanelLeftClose className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b bg-card/85 px-4 backdrop-blur lg:hidden">
          <button onClick={() => setMobileOpen(true)} className="-ml-2 p-2" aria-label="打开菜单">
            <Menu className="h-5 w-5" />
          </button>
          <Logo tone="default" markClassName="h-7" />
          <ThemeToggle className="-mr-1" />
        </header>

        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
