import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { cardApi } from "@/lib/api/card";
import { CardEditor } from "@/components/card-editor";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_app/cards_/$cardId")({
  head: () => ({ meta: [{ title: "编辑卡片 · 妙作 Muso" }] }),
  component: EditCardPage,
});

function EditCardPage() {
  const { cardId } = Route.useParams();
  const id = Number(cardId);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["card", id],
    queryFn: () => cardApi.get(id),
    enabled: Number.isFinite(id),
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="grid gap-5 lg:grid-cols-[400px_1fr]">
        <Skeleton className="h-[560px] rounded-2xl" />
        <Skeleton className="h-[560px] rounded-2xl" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm font-medium">卡片打不开</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          {(error as Error)?.message || "卡片可能已经被删除了。"}
        </p>
        <Button asChild size="sm" variant="outline">
          <Link to="/cards">返回列表</Link>
        </Button>
      </div>
    );
  }

  return <CardEditor card={data} />;
}
