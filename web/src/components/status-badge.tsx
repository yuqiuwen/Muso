import { cn } from "@/lib/utils";
import { STATUS_DOT, STATUS_STYLE } from "@/lib/constant";

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        STATUS_STYLE[status] ?? "border-border bg-muted text-muted-foreground",
        className,
      )}
    >
      <span
        className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[status] ?? "bg-muted-foreground")}
      />
      {status}
    </span>
  );
}
