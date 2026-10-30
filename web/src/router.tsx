import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { toast } from "sonner";

import { routeTree } from "./routeTree.gen";

const showError = (err: unknown) => {
  if (typeof window === "undefined") return;
  const msg = (err as Error)?.message;
  if (msg) toast.error(msg, { id: msg });
};

export const getRouter = () => {
  const queryClient = new QueryClient({
    // 全局兜底：任何请求失败都弹后端 errmsg，避免页面静默空白
    queryCache: new QueryCache({ onError: showError }),
    mutationCache: new MutationCache({
      onError: (err, _v, _c, mutation) => {
        if (!mutation.options.onError) showError(err);
      },
    }),
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
    },
  });

  return createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
  });
};

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
