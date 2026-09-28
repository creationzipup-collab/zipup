"use client";

import * as React from "react";

import { useNow } from "@/lib/client/use-now";
import { avatarColor, cn, initials, timeAgo } from "@/lib/utils";

export function Badge({
  className,
  tone = "neutral",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  tone?: "neutral" | "accent" | "success" | "warning" | "danger" | "info" | "outline";
}) {
  const tones = {
    neutral: "bg-white/[0.06] text-fg-2",
    accent: "bg-accent-soft text-accent",
    success: "bg-success/12 text-success",
    warning: "bg-warning/12 text-warning",
    danger: "bg-danger/12 text-danger",
    info: "bg-info/12 text-info",
    outline: "border border-line-2 text-fg-2",
  };
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-md px-1.5 text-[11px] font-medium [&_svg]:size-3",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

export function Kbd({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-line-2 bg-white/[0.04] px-1 font-mono text-[10.5px] text-fg-3",
        className,
      )}
      {...props}
    />
  );
}

export function Avatar({
  name,
  image,
  size = 28,
  className,
}: {
  name: string;
  image?: string | null;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full text-white ring-1 ring-white/10",
        className,
      )}
      style={{ width: size, height: size, background: avatarColor(name), fontSize: Math.max(9, size * 0.36) }}
      title={name}
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="size-full object-cover" />
      ) : (
        <span className="font-semibold tracking-tight">{initials(name)}</span>
      )}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 px-6 py-16 text-center", className)}>
      {icon && (
        <div className="flex size-12 items-center justify-center rounded-full border border-dashed border-line-3 text-fg-3 [&_svg]:size-5">
          {icon}
        </div>
      )}
      <div className="flex flex-col gap-1">
        <p className="text-[15px] font-semibold">{title}</p>
        {description && <p className="max-w-sm text-sm text-fg-3">{description}</p>}
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** 상대 시간 (하이드레이션 불일치 방지) */
export function TimeAgo({ date, className }: { date: string | Date; className?: string }) {
  useNow(30_000); // 30초마다 다시 그림
  return (
    <time suppressHydrationWarning dateTime={new Date(date).toISOString()} className={className}>
      {timeAgo(date)}
    </time>
  );
}

export function Separator({ className, vertical }: { className?: string; vertical?: boolean }) {
  return <div className={cn(vertical ? "h-full w-px" : "h-px w-full", "bg-line", className)} />;
}

export function Progress({ value, className, tone = "fg" }: { value: number; className?: string; tone?: "fg" | "accent" | "danger" | "warning" }) {
  const color = { fg: "bg-fg", accent: "bg-accent shadow-[0_0_10px_var(--accent-glow)]", danger: "bg-danger", warning: "bg-warning" }[tone];
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]", className)}>
      <div className={cn("h-full rounded-full transition-[width] duration-500", color)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}
