import { Link } from "@tanstack/react-router";
import { ArrowLeft, Clock } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

export function ComingSoon({
  icon: Icon,
  title,
  description,
  points,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  points: string[];
}) {
  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <div className="w-full max-w-xl">
        <div className="relative overflow-hidden rounded-3xl border border-border bg-card p-8 shadow-soft sm:p-10">
          <div className="pointer-events-none absolute -top-24 -right-20 h-56 w-56 rounded-full bg-primary/8 blur-2xl" />
          <div className="relative">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-lilac/50 bg-lilac/15 px-2.5 py-1 text-[11px] font-medium text-lilac-foreground dark:text-lilac">
                <Clock className="h-3 w-3" />
                开发中
              </span>
            </div>

            <h1 className="mt-6 text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>

            <ul className="mt-6 space-y-2.5">
              {points.map((point) => (
                <li key={point} className="flex items-start gap-2.5 text-sm text-foreground/80">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-lilac" />
                  {point}
                </li>
              ))}
            </ul>

            <div className="mt-8 flex gap-2">
              <Button asChild variant="outline" size="sm">
                <Link to="/cards">
                  <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                  去看图文
                </Link>
              </Button>
              <Button asChild size="sm">
                <Link to="/dashboard">回到工作台</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
