import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Pager({
  page,
  pages,
  total,
  limit,
  onPage,
  className,
}: {
  page: number;
  pages: number;
  total: number;
  limit: number;
  onPage: (page: number) => void;
  className?: string;
}) {
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return (
    <div className={cn("mt-4 flex flex-wrap items-center justify-between gap-3", className)}>
      <p className="text-xs text-muted-foreground">
        第 <span className="tnum font-medium text-foreground">{from}</span>–
        <span className="tnum font-medium text-foreground">{to}</span> 条，共{" "}
        <span className="tnum font-medium text-foreground">{total.toLocaleString()}</span> 条
      </p>
      <div className="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1 px-2.5"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          上一页
        </Button>
        <span className="tnum px-2 text-xs text-muted-foreground">
          {page} / {Math.max(pages, 1)}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1 px-2.5"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
        >
          下一页
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
