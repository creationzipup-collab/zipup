"use client";

import { Check, ChevronDown } from "lucide-react";
import { motion } from "motion/react";
import { Select as S, Slider as Sl, Switch as Sw, Tabs as Tb } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/utils";

/* --------------------------------- Switch --------------------------------- */

export function Switch({ className, ...props }: React.ComponentProps<typeof Sw.Root>) {
  return (
    <Sw.Root
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-line-2 bg-white/[0.06] transition-[background,box-shadow] data-[state=checked]:border-transparent data-[state=checked]:bg-accent data-[state=checked]:shadow-[0_0_14px_-3px_var(--accent-glow)]",
        className,
      )}
      {...props}
    >
      <Sw.Thumb className="block size-4 translate-x-0.5 rounded-full bg-fg-2 shadow transition-transform data-[state=checked]:translate-x-[17px] data-[state=checked]:bg-white" />
    </Sw.Root>
  );
}

/* --------------------------------- Slider --------------------------------- */

export function Slider({ className, ...props }: React.ComponentProps<typeof Sl.Root>) {
  return (
    <Sl.Root className={cn("relative flex h-5 w-full touch-none select-none items-center", className)} {...props}>
      <Sl.Track className="relative h-[3px] grow overflow-hidden rounded-full bg-white/[0.08]">
        <Sl.Range className="absolute h-full bg-accent shadow-[0_0_10px_var(--accent-glow)]" />
      </Sl.Track>
      <Sl.Thumb className="block size-4 rounded-full border border-white/70 bg-white shadow-[0_0_0_4px_rgb(255_255_255/0.06)] transition-transform hover:scale-110 focus-visible:outline-none" />
    </Sl.Root>
  );
}

/* ---------------------------------- Select --------------------------------- */

export function Select({
  value,
  onValueChange,
  options,
  placeholder,
  className,
  size = "md",
  disabled,
}: {
  value?: string;
  onValueChange: (v: string) => void;
  options: { value: string; label: React.ReactNode; hint?: React.ReactNode }[];
  placeholder?: string;
  className?: string;
  size?: "sm" | "md";
  disabled?: boolean;
}) {
  return (
    <S.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <S.Trigger
        className={cn(
          "inline-flex items-center justify-between gap-2 rounded-[10px] border border-line-2 bg-white/[0.03] px-3 text-left text-sm text-fg outline-none transition hover:border-line-3 data-[state=open]:border-accent/60 data-[placeholder]:text-fg-4",
          size === "sm" ? "h-8 text-[13px]" : "h-10",
          className,
        )}
      >
        <S.Value placeholder={placeholder} />
        <S.Icon>
          <ChevronDown className="size-4 text-fg-3" />
        </S.Icon>
      </S.Trigger>
      <S.Portal>
        <S.Content
          position="popper"
          sideOffset={6}
          className="glass-strong z-50 max-h-[min(360px,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-xl p-1 shadow-[var(--shadow-pop)]"
        >
          <S.Viewport>
            {options.map((o) => (
              <S.Item
                key={o.value}
                value={o.value}
                className="relative flex h-8 cursor-default select-none items-center gap-2 rounded-lg pl-7 pr-3 text-[13px] text-fg-2 outline-none data-[highlighted]:bg-white/[0.07] data-[highlighted]:text-fg"
              >
                <S.ItemIndicator className="absolute left-2">
                  <Check className="size-3.5" />
                </S.ItemIndicator>
                <S.ItemText>{o.label}</S.ItemText>
                {o.hint && <span className="ml-auto pl-3 text-[11px] text-fg-4">{o.hint}</span>}
              </S.Item>
            ))}
          </S.Viewport>
        </S.Content>
      </S.Portal>
    </S.Root>
  );
}

/* ---------------------------------- Tabs ----------------------------------- */

export const Tabs = Tb.Root;
export const TabsContent = Tb.Content;

export function TabsList({ className, ...props }: React.ComponentProps<typeof Tb.List>) {
  return <Tb.List className={cn("flex items-center gap-1 border-b border-line", className)} {...props} />;
}

export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof Tb.Trigger>) {
  return (
    <Tb.Trigger
      className={cn(
        "relative -mb-px inline-flex h-10 items-center gap-2 border-b border-transparent px-3 text-sm text-fg-3 transition hover:text-fg-2 data-[state=active]:border-accent data-[state=active]:text-fg data-[state=active]:shadow-[0_1px_0_0_var(--accent),0_6px_14px_-8px_var(--accent-glow)] [&_svg]:size-4",
        className,
      )}
      {...props}
    />
  );
}

/* -------------------------------- Segmented -------------------------------- */

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = "sm",
  className,
  layoutId,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode; hint?: string; disabled?: boolean }[];
  size?: "xs" | "sm" | "md";
  className?: string;
  layoutId?: string;
}) {
  const id = React.useId();
  return (
    <div
      role="radiogroup"
      className={cn("inline-flex items-center gap-0.5 rounded-full border border-line-2 bg-white/[0.03] p-0.5", className)}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={o.disabled}
            title={o.hint}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative flex-1 whitespace-nowrap rounded-full font-medium transition-colors disabled:opacity-40",
              size === "xs" && "h-6 px-2 text-[11.5px]",
              size === "sm" && "h-7 px-3 text-[12.5px]",
              size === "md" && "h-8 px-3.5 text-[13px]",
              active ? "text-inv-fg" : "text-fg-3 hover:text-fg",
            )}
          >
            {active && (
              <motion.span
                layoutId={layoutId ?? `seg-${id}`}
                className="absolute inset-0 rounded-full bg-inv shadow-[inset_0_1px_0_rgb(255_255_255/0.7)]"
                transition={{ type: "spring", bounce: 0.18, duration: 0.35 }}
              />
            )}
            <span className="relative z-10">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
