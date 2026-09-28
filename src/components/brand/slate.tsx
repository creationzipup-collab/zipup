"use client";

import { motion } from "motion/react";
import * as React from "react";

import { cn } from "@/lib/utils";

const pad = (n: number) => String(n).padStart(2, "0");

/** 오늘 (한국 시간) MM.DD */
function today() {
  const k = new Date(Date.now() + 9 * 3600_000);
  return `${pad(k.getUTCMonth() + 1)}.${pad(k.getUTCDate())}`;
}

/** 이름에서 만든 바코드 막대 (같은 이름이면 항상 같은 모양) */
function bars(seed: string, n = 34): number[] {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return Array.from({ length: n }, (_, i) => {
    h = Math.imul(h ^ (i + 7), 2654435761);
    return 1 + ((h >>> 0) % 3);
  });
}

/**
 * 슬레이트 — 점선 모서리 틀 안에 씬·테이크·롤을 가는 숫자로. 나타날 때 한 번 빛줄이 훑고 지나가요.
 * 빈 결과 화면에서 "여기부터 테이크가 쌓인다"는 자리표시.
 */
export function Slate({
  director,
  take = 1,
  roll = "A001",
  label = "Studio",
  className,
}: {
  director?: string | null;
  take?: number;
  roll?: string;
  label?: string;
  className?: string;
}) {
  const [sweep, setSweep] = React.useState(0);
  const code = bars(`${director ?? ""}${roll}`);
  const cells = [
    { k: "Scene", v: today() },
    { k: "Take", v: pad(take), accent: true },
    { k: "Roll", v: roll },
  ];
  return (
    <div
      aria-hidden
      className={cn("corners corners-dashed relative w-[340px] select-none overflow-hidden rounded-[14px] bg-white/[0.012] p-5", className)}
      onPointerEnter={() => setSweep((s) => s + 1)}
    >
      {/* 빛줄 */}
      <motion.span
        key={sweep}
        className="pointer-events-none absolute inset-x-0 h-px bg-[linear-gradient(90deg,transparent,var(--accent)_30%,#d6efff_50%,var(--accent)_70%,transparent)] shadow-[0_0_14px_var(--accent-glow)]"
        initial={{ top: "0%", opacity: 0 }}
        animate={{ top: ["0%", "100%"], opacity: [0, 1, 1, 0] }}
        transition={{ duration: 1.4, ease: [0.65, 0, 0.35, 1] }}
      />

      <div className="flex items-start justify-between gap-4">
        <span className="font-mono text-[10px] uppercase leading-4 tracking-[0.2em] text-fg-3">
          Creation Zipup
          <br />
          <span className="text-fg-4">{label}</span>
        </span>
        <span className="flex h-7 items-end gap-[1.5px]">
          {code.map((w, i) => (
            <span key={i} className="h-full bg-fg-3/70" style={{ width: w }} />
          ))}
        </span>
      </div>

      <div className="mt-7 grid grid-cols-3 gap-3">
        {cells.map((c) => (
          <div key={c.k} className="min-w-0">
            <span className="block font-mono text-[9.5px] uppercase tracking-[0.2em] text-fg-4">{c.k}</span>
            <span className={cn("num mt-2 block truncate text-[40px]", c.accent ? "glow-text" : "text-fg")} suppressHydrationWarning>
              {c.v}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-6 flex items-center justify-between border-t border-dashed border-line-2 pt-3 font-mono text-[10.5px] uppercase tracking-[0.16em]">
        <span className="min-w-0 truncate text-fg-4">
          Dir <span className="ml-1.5 normal-case tracking-normal text-fg-2">{director || "—"}</span>
        </span>
        <span className="flex items-center gap-2 text-fg-3">
          <span className="relative flex size-1.5">
            <span className="absolute inset-0 animate-ping rounded-full bg-accent opacity-60" />
            <span className="relative size-1.5 rounded-full bg-accent" />
          </span>
          Standby
        </span>
      </div>
    </div>
  );
}
