import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useThemeStore } from "@/stores/theme-store";

/**
 * 深色 / 浅色切换。
 * 两个图标都渲染，靠 `dark:` 变体决定显隐 —— 这样 SSR 与客户端首帧完全一致，
 * 不会出现水合不匹配，也不用等 mount 才敢画图标。
 */
export function ThemeToggle({ className }: { className?: string }) {
  const toggle = useThemeStore((s) => s.toggle);

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      className={cn("h-8 w-8", className)}
      aria-label="切换深色 / 浅色主题"
      title="切换深色 / 浅色主题"
    >
      <Sun className="hidden h-4 w-4 dark:block" />
      <Moon className="h-4 w-4 dark:hidden" />
    </Button>
  );
}
