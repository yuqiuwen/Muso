import { cn } from "@/lib/utils";

/**
 * Muso 标识：一枚「卡片 + 笔触」的抽象 M。
 * 底色是品牌紫渐变（#7C3AED → #A78BFA），笔触用极浅紫 —— 对应「妙作」的手作感。
 * 只在标识本身用这组品牌色，界面其余部分一律走主题变量。
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("h-8 w-8", className)}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="muso-mark" x1="4" y1="2" x2="36" y2="38" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7C3AED" />
          <stop offset="1" stopColor="#A78BFA" />
        </linearGradient>
        <linearGradient
          id="muso-stroke"
          x1="12"
          y1="26"
          x2="30"
          y2="12"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#DDD6FE" />
          <stop offset="1" stopColor="#FFFFFF" />
        </linearGradient>
      </defs>
      <rect x="1.5" y="1.5" width="37" height="37" rx="11" fill="url(#muso-mark)" />
      <rect
        x="1.5"
        y="1.5"
        width="37"
        height="37"
        rx="11"
        stroke="#C4B5FD"
        strokeOpacity="0.45"
        strokeWidth="1"
      />
      {/* 卡片轮廓 */}
      <rect
        x="10.5"
        y="9.5"
        width="19"
        height="21"
        rx="4"
        stroke="#F5F3FF"
        strokeOpacity="0.6"
        strokeWidth="1.4"
      />
      {/* 笔触 M */}
      <path
        d="M14.5 25.5V15.8l5.6 6.2 5.6-6.2v9.7"
        stroke="url(#muso-stroke)"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="27.4" cy="12.4" r="1.7" fill="#DDD6FE" />
    </svg>
  );
}

export function Logo({
  tone = "default",
  className,
  markClassName,
  showWordmark = true,
  subtitle,
}: {
  /** default：页面 / 顶栏；sidebar：侧边导航（跟随 --sidebar-foreground） */
  tone?: "default" | "sidebar";
  className?: string;
  markClassName?: string;
  showWordmark?: boolean;
  subtitle?: string;
}) {
  const primary = tone === "sidebar" ? "text-sidebar-foreground" : "text-foreground";
  const secondary = tone === "sidebar" ? "text-sidebar-foreground/55" : "text-muted-foreground";

  return (
    <span className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <LogoMark className={markClassName} />
      {showWordmark && (
        <span className="flex min-w-0 flex-col leading-none">
          <span className={cn("flex items-baseline gap-1.5", primary)}>
            <span className="text-[17px] font-semibold tracking-tight">妙作</span>
            <span className="text-[13px] font-medium tracking-[0.14em] text-primary uppercase">
              Muso
            </span>
          </span>
          {subtitle && (
            <span className={cn("mt-1 truncate text-[11px] tracking-wide", secondary)}>
              {subtitle}
            </span>
          )}
        </span>
      )}
    </span>
  );
}

/** 浏览器 favicon：内联 SVG，省一次请求 */
export const FAVICON_DATA_URI =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">
      <defs><linearGradient id="g" x1="4" y1="2" x2="36" y2="38" gradientUnits="userSpaceOnUse">
        <stop stop-color="#7C3AED"/><stop offset="1" stop-color="#A78BFA"/></linearGradient></defs>
      <rect x="1.5" y="1.5" width="37" height="37" rx="11" fill="url(#g)"/>
      <rect x="10.5" y="9.5" width="19" height="21" rx="4" stroke="#F5F3FF" stroke-opacity=".6" stroke-width="1.4" fill="none"/>
      <path d="M14.5 25.5V15.8l5.6 6.2 5.6-6.2v9.7" stroke="#FFFFFF" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
      <circle cx="27.4" cy="12.4" r="1.7" fill="#DDD6FE"/>
    </svg>`,
  );
