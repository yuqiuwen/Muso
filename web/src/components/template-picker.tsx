import { useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

import { PROMPT_KINDS, PROMPT_KIND_STYLE, promptKindLabel } from "@/lib/constant";
import type { TemplateItem } from "@/lib/api/prompt";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

/** 后端只允许 1/2/3，脏数据统一归到「其他」，免得模板从列表里消失 */
function normalizeKind(kind: number): number {
  return PROMPT_KINDS.some((k) => k.value === kind)
    ? kind
    : PROMPT_KINDS[PROMPT_KINDS.length - 1].value;
}

function KindBadge({ kind, className }: { kind: number; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-4 shrink-0 items-center rounded border px-1 text-[10px] leading-none font-normal",
        PROMPT_KIND_STYLE[normalizeKind(kind)],
        className,
      )}
    >
      {promptKindLabel(kind)}
    </span>
  );
}

interface TemplatePickerProps {
  templates: TemplateItem[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}

/**
 * 提示词模板选择器：分组 + 前端搜索。
 *
 * Radix Select 没法在下拉里塞输入框（item 必须直接挂在 viewport 下，插个 input 会打断
 * 键盘导航和滚动），所以换成 shadcn 的 Combobox 写法：Popover + cmdk。
 * 过滤交给组件自己算（`shouldFilter={false}`），因为 cmdk 默认的 command-score 是给
 * 拉丁字母设计的，中文按字符打分容易漏；自己用 `includes` 更可预期，也不受输入法拼写过程干扰。
 */
export function TemplatePicker({ templates, value, onChange, className }: TemplatePickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = templates.find((t) => t.id === value);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return PROMPT_KINDS.map((kind) => ({
      ...kind,
      items: templates
        .filter((t) => normalizeKind(t.kind) === kind.value)
        .filter(
          (t) =>
            !q ||
            t.name.toLowerCase().includes(q) ||
            (t.description || "").toLowerCase().includes(q) ||
            // 输入「生图 / 文本」这类词时，整组都留下
            kind.label.includes(q),
        ),
    })).filter((group) => group.items.length > 0);
  }, [templates, query]);

  const hitCount = groups.reduce((n, group) => n + group.items.length, 0);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          className={cn(
            "flex h-9 min-w-[200px] flex-1 items-center gap-1.5 rounded-md border border-input bg-field px-3 text-xs shadow-sm outline-none",
            "hover:border-border-hover focus-visible:border-primary/60 focus-visible:ring-1 focus-visible:ring-ring",
            className,
          )}
        >
          {selected && <KindBadge kind={selected.kind} />}
          <span className={cn("truncate", !selected && "text-subtle")}>
            {selected
              ? `${selected.name}${selected.builtin ? "（内置）" : ""}`
              : "选择一个提示词模板"}
          </span>
          <ChevronDown className="ml-auto h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        className="w-(--radix-popover-trigger-width) min-w-[260px] p-0"
        onOpenAutoFocus={(event) => {
          // 别让 Radix 把焦点打到内容容器上，直接给输入框
          event.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <Command shouldFilter={false} className="rounded-md" defaultValue={value || undefined}>
          <CommandInput
            ref={inputRef}
            value={query}
            onValueChange={setQuery}
            placeholder="搜模板名，也可以输入 生图 / 文本"
            className="h-9 py-2 text-[13px]"
          />
          <CommandList className="max-h-72">
            {groups.map((group) => (
              <CommandGroup
                key={group.value}
                heading={
                  <span className="flex items-center gap-1.5">
                    <KindBadge kind={group.value} />
                    <span className="tnum text-[10.5px] font-normal text-muted-foreground">
                      {group.items.length}
                    </span>
                    <span className="text-[10.5px] font-normal text-subtle">{group.hint}</span>
                  </span>
                }
              >
                {group.items.map((tpl) => (
                  <CommandItem
                    key={tpl.id}
                    value={tpl.id}
                    onSelect={() => {
                      onChange(tpl.id);
                      setOpen(false);
                    }}
                    className="gap-2 text-[13px]"
                  >
                    <span className="truncate">{tpl.name}</span>
                    {tpl.builtin && (
                      <span className="shrink-0 rounded border border-border px-1 text-[10px] leading-4 text-subtle">
                        内置
                      </span>
                    )}
                    {tpl.id === value && (
                      <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-primary" />
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
            {hitCount === 0 && <CommandEmpty>没有匹配的模板，换个关键词试试</CommandEmpty>}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
