"use client";

import { motion, useInView } from "motion/react";
import Link from "next/link";
import * as React from "react";

import { cn, usd } from "@/lib/utils";

/**
 * 계기판 부품 — 얇은 선, 가는 큰 숫자, 모서리 표시, 빛나는 한 줄.
 * 포인트 색(하늘색)은 "지금"과 "진행"에만 써요. 나머지는 흰색 농도로만 구분해요.
 */

/* ---------------------------------------------------------------------------------------------- */
/*                                             숫자                                               */
/* ---------------------------------------------------------------------------------------------- */

export type NumberFormat = "int" | "usd" | "pct" | "dec1";

export function formatNumber(n: number, f: NumberFormat = "int"): string {
  if (f === "usd") return usd(n);
  if (f === "pct") return `${Math.round(n)}`;
  if (f === "dec1") return n.toFixed(1);
  return Math.round(n).toLocaleString("ko-KR");
}

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const CELL = 1.02;

/**
 * 자리마다 굴러가는 숫자. 처음 보일 때 0에서 굴러 올라오고, 값이 바뀌면 그 자리만 굴러요.
 * ghost를 켜면 지나온 숫자가 위에 흐리게 남아요.
 */
export function Ticker({
  value,
  format = "int",
  ghost = false,
  className,
  digitClassName,
}: {
  value: number;
  format?: NumberFormat;
  ghost?: boolean;
  className?: string;
  digitClassName?: string;
}) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -5% 0px" });
  const text = formatNumber(value, format);
  const shown = inView ? text : text.replace(/\d/g, "0");
  const chars = shown.split("");
  return (
    <span ref={ref} className={cn("inline-flex items-end tabular-nums", className)}>
      <span className="sr-only">{text}</span>
      {chars.map((ch, i) =>
        /\d/.test(ch) ? (
          <TickerDigit key={`d${chars.length - i}`} d={Number(ch)} delay={(chars.length - i) * 0.05} ghost={ghost} className={digitClassName} />
        ) : (
          <span key={`s${chars.length - i}`} aria-hidden className="leading-[1.02em]">
            {ch}
          </span>
        ),
      )}
    </span>
  );
}

function TickerDigit({ d, delay, ghost, className }: { d: number; delay: number; ghost: boolean; className?: string }) {
  // ghost: 창을 위로 두 칸 더 열고, 위쪽은 서서히 사라지게
  const rows = ghost ? 3 : 1;
  return (
    <span
      aria-hidden
      className={cn("relative inline-block overflow-hidden", className)}
      style={{
        height: `${CELL * rows}em`,
        lineHeight: `${CELL}em`,
        maskImage: ghost ? "linear-gradient(to bottom, transparent 0%, rgb(0 0 0 / 0.25) 30%, rgb(0 0 0 / 0.5) 62%, #000 67%)" : undefined,
        WebkitMaskImage: ghost ? "linear-gradient(to bottom, transparent 0%, rgb(0 0 0 / 0.25) 30%, rgb(0 0 0 / 0.5) 62%, #000 67%)" : undefined,
      }}
    >
      <span className="invisible block">0</span>
      <motion.span
        className="absolute inset-x-0 top-0 flex flex-col"
        initial={false}
        animate={{ y: `${-(d - (rows - 1)) * CELL}em` }}
        transition={{ type: "spring", stiffness: 110, damping: 19, mass: 0.9, delay }}
      >
        {/* 위로 두 칸 여유: 0 위에도 흐린 숫자가 보이게 8, 9를 한 번 더 */}
        {[8, 9, ...DIGITS].map((n, i) => (
          <span key={i} className="block text-center" style={{ height: `${CELL}em`, marginTop: i === 0 ? `${-2 * CELL}em` : undefined }}>
            {n}
          </span>
        ))}
      </motion.span>
    </span>
  );
}

/**
 * 가는 큰 숫자 + 작은 단위 + 라벨 (계기판 한 칸).
 */
export function Metric({
  value,
  unit,
  label,
  format = "int",
  size = "md",
  ghost,
  tone = "fg",
  className,
  sub,
}: {
  value: number;
  unit?: string;
  label?: React.ReactNode;
  format?: NumberFormat;
  size?: "sm" | "md" | "lg" | "xl";
  ghost?: boolean;
  tone?: "fg" | "accent";
  className?: string;
  sub?: React.ReactNode;
}) {
  const px = { sm: "text-[28px]", md: "text-[42px]", lg: "text-[64px]", xl: "text-[clamp(72px,9vw,128px)]" }[size];
  return (
    <div className={cn("flex min-w-0 flex-col", className)}>
      <div className={cn("num flex items-start", px, tone === "accent" ? "glow-text" : "text-fg")}>
        <Ticker value={value} format={format} ghost={ghost} />
        {unit && <span className="num-unit mt-[0.18em]">{unit}</span>}
      </div>
      {label && <div className="mt-2 text-[12px] text-fg-3">{label}</div>}
      {sub && <div className="mt-1 text-[11.5px] text-fg-4">{sub}</div>}
    </div>
  );
}

/* ---------------------------------------------------------------------------------------------- */
/*                                             틀                                                 */
/* ---------------------------------------------------------------------------------------------- */

/**
 * 모서리 표시가 있는 틀. dashed=점선 테두리, line=실선, glass=반투명 유리.
 * label은 왼쪽 위 "01 / 제목", aside는 오른쪽 위.
 */
export function Frame({
  variant = "line",
  label,
  aside,
  className,
  bodyClassName,
  children,
  as: Comp = "section",
}: {
  variant?: "dashed" | "line" | "glass" | "bare";
  label?: React.ReactNode;
  aside?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children?: React.ReactNode;
  as?: "section" | "div" | "article" | "aside";
}) {
  return (
    <Comp
      className={cn(
        "corners relative flex min-w-0 flex-col rounded-[14px]",
        variant === "dashed" && "corners-dashed",
        variant === "line" && "border border-line bg-white/[0.012]",
        variant === "glass" && "glass",
        className,
      )}
    >
      {(label || aside) && (
        <header className="flex items-center justify-between gap-3 px-4 pt-3.5">
          {label ? <div className="flex min-w-0 items-center gap-2 text-[12px] text-fg-3">{label}</div> : <span />}
          {aside && <div className="flex shrink-0 items-center gap-2 text-[11.5px] text-fg-4">{aside}</div>}
        </header>
      )}
      <div className={cn("flex min-h-0 flex-1 flex-col p-4", bodyClassName)}>{children}</div>
    </Comp>
  );
}

/** "01 / 진행 중인 컷" — 모노 번호 + 제목 */
export function IndexLabel({ index, children, className }: { index?: string; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2", className)}>
      {index && <span className="font-mono text-[10.5px] tracking-[0.14em] text-fg-4">{index} /</span>}
      <span className="truncate">{children}</span>
    </span>
  );
}

/** 섹션 머리: 번호 / 제목 ———— 링크 */
export function SectionHead({
  index,
  title,
  href,
  hrefLabel = "전체",
  aside,
  className,
}: {
  index?: string;
  title: React.ReactNode;
  href?: string;
  hrefLabel?: string;
  aside?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      {index && <span className="font-mono text-[10.5px] tracking-[0.14em] text-fg-4">{index}</span>}
      <h2 className="shrink-0 text-[15px] font-medium tracking-[-0.01em] text-fg">{title}</h2>
      <span aria-hidden className="h-px flex-1 bg-gradient-to-r from-line-2 to-transparent" />
      {aside}
      {href && (
        <Link href={href} className="group inline-flex shrink-0 items-center gap-1.5 text-[12px] text-fg-3 transition hover:text-fg">
          {hrefLabel}
          <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
            →
          </span>
        </Link>
      )}
    </div>
  );
}

/** 작은 알약 라벨 */
export function Pill({
  children,
  tone = "line",
  className,
}: {
  children: React.ReactNode;
  tone?: "line" | "solid" | "accent" | "ok" | "ng" | "keep" | "review";
  className?: string;
}) {
  const tones = {
    line: "border border-line-2 text-fg-2",
    solid: "bg-inv text-inv-fg",
    accent: "border border-accent/40 bg-accent/10 text-accent",
    ok: "border border-success/35 bg-success/10 text-success",
    ng: "border border-danger/35 bg-danger/10 text-danger",
    keep: "border border-warning/35 bg-warning/10 text-warning",
    review: "border border-info/35 bg-info/10 text-info",
  };
  return (
    <span className={cn("inline-flex h-[22px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[11px] font-medium [&_svg]:size-3", tones[tone], className)}>
      {children}
    </span>
  );
}

/** 지금 살아 있는 것 (생성 중·접속 중) */
export function LiveDot({ className, tone = "accent" }: { className?: string; tone?: "accent" | "ok" }) {
  return (
    <span className={cn("relative inline-flex size-2 shrink-0", className)}>
      <span className={cn("absolute inset-0 animate-ping rounded-full opacity-60", tone === "accent" ? "bg-accent" : "bg-success")} />
      <span className={cn("relative inline-flex size-2 rounded-full", tone === "accent" ? "bg-accent shadow-[0_0_8px_var(--accent-glow)]" : "bg-success")} />
    </span>
  );
}

/* ---------------------------------------------------------------------------------------------- */
/*                                           게이지                                               */
/* ---------------------------------------------------------------------------------------------- */

/**
 * 눈금 링 게이지 — 가는 눈금 원 위에 값만큼 빛나는 호. 가운데에는 children.
 */
export function RingGauge({
  value,
  size = 168,
  ticks = 60,
  className,
  children,
  label,
}: {
  /** 0 ~ 1 */
  value: number;
  size?: number;
  ticks?: number;
  className?: string;
  children?: React.ReactNode;
  label?: string;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true });
  const v = Math.max(0, Math.min(1, value));
  const r = size / 2 - 10;
  const c = 2 * Math.PI * r;
  const lit = Math.round(v * ticks);
  const gid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <div ref={ref} className={cn("relative shrink-0", className)} style={{ width: size, height: size }} role="img" aria-label={label ?? `${Math.round(v * 100)}%`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90 overflow-visible">
        <defs>
          <linearGradient id={`g${gid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--accent-deep)" />
            <stop offset="100%" stopColor="var(--accent-2)" />
          </linearGradient>
        </defs>
        {/* 눈금 */}
        {Array.from({ length: ticks }).map((_, i) => {
          const a = (i / ticks) * Math.PI * 2;
          const r1 = size / 2 - 2;
          const r2 = size / 2 - (i % 5 === 0 ? 7 : 5);
          const on = inView && i < lit;
          return (
            <line
              key={i}
              x1={size / 2 + Math.cos(a) * r1}
              y1={size / 2 + Math.sin(a) * r1}
              x2={size / 2 + Math.cos(a) * r2}
              y2={size / 2 + Math.sin(a) * r2}
              stroke={on ? "var(--accent)" : "var(--line-2)"}
              strokeWidth={1}
              style={{ transition: `stroke 0.3s ease ${0.3 + (i / ticks) * 0.9}s` }}
            />
          );
        })}
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={1} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#g${gid})`}
          strokeWidth={2}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: inView ? c * (1 - v) : c }}
          transition={{ duration: 1.4, ease: [0.2, 0.8, 0.2, 1], delay: 0.2 }}
          style={{ filter: "drop-shadow(0 0 6px var(--accent-glow))" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}

/**
 * 가는 막대 히스토그램. 마지막(오늘) 막대만 포인트 색, 마우스를 올리면 값이 보여요.
 */
export function Histogram({
  data,
  height = 56,
  className,
  highlightLast = true,
  unit = "",
}: {
  data: { label: string; value: number }[];
  height?: number;
  className?: string;
  highlightLast?: boolean;
  unit?: string;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true });
  const [hover, setHover] = React.useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const active = hover ?? (highlightLast ? data.length - 1 : null);
  return (
    <div ref={ref} className={cn("relative", className)} onPointerLeave={() => setHover(null)}>
      <div className="flex items-end gap-[3px]" style={{ height }}>
        {data.map((d, i) => {
          const h = Math.max(2, (d.value / max) * height);
          const on = i === active;
          return (
            <div key={i} className="group relative flex h-full flex-1 items-end" onPointerEnter={() => setHover(i)}>
              <motion.div
                className={cn("w-full rounded-t-[2px]", on ? "bg-accent shadow-[0_0_10px_var(--accent-glow)]" : "bg-white/[0.16] group-hover:bg-white/30")}
                initial={{ height: 2 }}
                animate={{ height: inView ? h : 2 }}
                transition={{ duration: 0.7, delay: inView ? i * 0.025 : 0, ease: [0.2, 0.8, 0.2, 1] }}
              />
            </div>
          );
        })}
      </div>
      {active !== null && data[active] && (
        <div
          className="pointer-events-none absolute -top-7 whitespace-nowrap rounded-md border border-line-2 bg-bg/90 px-1.5 py-0.5 font-mono text-[10.5px] text-fg-2 backdrop-blur"
          // 양 끝 막대에서는 틀 밖으로 나가지 않게 한쪽으로 붙여요
          style={
            active / data.length > 0.7
              ? { right: `${((data.length - active - 1) / data.length) * 100}%` }
              : active / data.length < 0.3
                ? { left: `${(active / data.length) * 100}%` }
                : { left: `${((active + 0.5) / data.length) * 100}%`, transform: "translateX(-50%)" }
          }
        >
          {data[active].label} · {data[active].value.toLocaleString("ko-KR")}
          {unit}
        </div>
      )}
    </div>
  );
}

/** 여러 상태가 한 줄에 나뉜 막대 (컷 진행) */
export function SegmentBar({
  parts,
  className,
}: {
  parts: { value: number; className: string; label: string }[];
  className?: string;
}) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  if (!total) return <div className={cn("h-[3px] rounded-full bg-white/[0.06]", className)} />;
  return (
    <div className={cn("flex h-[3px] gap-[2px]", className)}>
      {parts
        .filter((p) => p.value > 0)
        .map((p) => (
          <div key={p.label} title={`${p.label} ${p.value}`} className={cn("h-full rounded-full", p.className)} style={{ flexGrow: p.value, flexBasis: 0 }} />
        ))}
    </div>
  );
}
