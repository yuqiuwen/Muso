import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  HeadContent,
  Link,
  Outlet,
  Scripts,
  useRouter,
  type ErrorComponentProps,
} from "@tanstack/react-router";

import { useEffect, useState } from "react";

import appCss from "../styles.css?url";
import { Toaster } from "@/components/ui/sonner";
import { FAVICON_DATA_URI } from "@/components/logo";
import { THEME_INIT_SCRIPT, useThemeStore } from "@/stores/theme-store";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <p className="text-7xl font-semibold tracking-tight text-primary/20">404</p>
        <h1 className="mt-4 text-xl font-semibold">页面不存在</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          这个地址没有对应的页面，可能已经被移动了。
        </p>
        <Link
          to="/dashboard"
          className="mt-6 inline-flex items-center justify-center rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          回到工作台
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">页面加载失败</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message || "发生了意外错误"}</p>
        <div className="mt-6 flex justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            重试
          </button>
          <a
            href="/dashboard"
            className="rounded-full border border-input bg-background px-5 py-2 text-sm font-medium hover:bg-accent"
          >
            回到工作台
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "妙作 Muso · 内容创作工作台" },
      {
        name: "description",
        content:
          "妙作 Muso 是图文、视频、音乐一站式内容创作工作台：词库、双语例句、提示词模板与卡片管理，把灵感整理成可发布的作品。",
      },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: FAVICON_DATA_URI },
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "" },
      {
        // Inter 负责西文与数字，Noto Sans SC（思源黑体）负责中文，只取 400/500/600/700
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+SC:wght@400;500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <HeadContent />
        {/* 首屏防闪：在样式与内容之前把 .dark 打上，避免先白后黑 */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const theme = useThemeStore((s) => s.theme);
  // Toaster 依赖主题，挂载后再渲染，避免 SSR / 客户端主题不一致导致水合告警
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      {mounted && <Toaster theme={theme} position="top-center" />}
    </QueryClientProvider>
  );
}
