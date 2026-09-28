"use client";

import { motion } from "motion/react";
import * as React from "react";

import { useNow } from "@/lib/client/use-now";
import type { CutDTO } from "@/lib/services/cuts";
import { CUT_STATUS_LABEL } from "@/lib/types";
import { isCodeLike } from "@/lib/cuts";
import { cn } from "@/lib/utils";

const DAY = 86_400_000;
const EASE = [0.2, 0.8, 0.2, 1] as const;

/** 막대 모양: 확정은 흰 막대, 작업 중은 하늘색 빛, 검토는 보라 테두리, 대기는 어두운 막대 */
const BAR: Record<CutDTO["status"], string> = {
  done: "bg-inv text-inv-fg shadow-[inset_0_1px_0_rgb(255_255_255/0.8)]",
  wip: "bg-[linear-gradient(90deg,var(--accent-deep),var(--accent))] text-white shadow-[0_0_24px_-6px_var(--accent-glow)]",
  review: "border border-info/60 bg-info/12 text-fg",
  todo: "border border-line-2 bg-white/[0.04] text-fg-2",
};
const BADGE: Record<CutDTO["status"], string> = {
  done: "bg-[#05070a] text-white",
  wip: "bg-white text-[#05070a]",
  review: "bg-white text-[#05070a]",
  todo: "bg-white/10 text-fg-2",
};

function fmtDay(t: number) {
  const d = new Date(t + 9 * 3600_000);
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}.${String(d.getUTCDate()).padStart(2, "0")}`;
}

function spanLabel(ms: number) {
  const days = ms / DAY;
  if (days < 1.5) return "1일";
  if (days < 14) return `${Math.round(days)}일`;
  if (days < 60) return `${(days / 7).toFixed(1).replace(/\.0$/, "")}주`;
  return `${(days / 30).toFixed(1).replace(/\.0$/, "")}개월`;
}

/**
 * 컷 타임라인 — 컷마다 첫 테이크부터 마지막 테이크까지 막대, OK가 나온 때는 점, 지금은 세로선.
 * 테이크가 없는 컷은 만든 날에 짧은 막대로.
 */
export function CutTimeline({ cuts, onOpen }: { cuts: CutDTO[]; onOpen: (id: string) => void }) {
  const now = useNow(60_000);
  const rows = cuts.map((c) => {
    const from = new Date(c.span?.from ?? c.createdAt).getTime();
    const to = Math.max(from, new Date(c.span?.to ?? c.createdAt).getTime());
    return { c, from, to };
  });
  const min = Math.min(now, ...rows.map((r) => r.from));
  // 최소 7일은 보여야 막대가 읽혀요. 오른쪽에 하루 여유.
  const start = Math.floor((min - 9 * 3600_000) / DAY) * DAY + 9 * 3600_000 - 0 * DAY;
  const end = Math.max(now + DAY, start + 7 * DAY);
  const total = end - start;
  const x = (t: number) => `${((t - start) / total) * 100}%`;
  const w = (a: number, b: number) => `max(${((b - a) / total) * 100}%, 34px)`;

  // 눈금: 기간에 맞춰 하루 · 이틀 · 일주일
  const days = total / DAY;
  const step = days <= 10 ? 1 : days <= 24 ? 2 : days <= 70 ? 7 : 14;
  const ticks: number[] = [];
  for (let t = start; t <= end; t += step * DAY) ticks.push(t);

  const worked = rows.filter((r) => r.c.span);
  const first = worked.length ? Math.min(...worked.map((r) => r.from)) : null;

  return (
    <section className="corners relative overflow-hidden rounded-[18px] border border-line bg-[linear-gradient(180deg,rgb(255_255_255/0.02),transparent_40%)]">
      <header className="flex items-end justify-between gap-4 px-5 pb-2 pt-5">
        <div>
          <h3 className="text-[19px] font-medium tracking-[-0.02em]">컷 타임라인</h3>
          <p className="mt-1 text-[12px] text-fg-4">첫 테이크부터 마지막 테이크까지. 점은 OK가 나온 때예요.</p>
        </div>
        <span className="num text-[26px] text-fg-3">{first ? spanLabel(now - first) : "—"}</span>
      </header>

      <div className="overflow-x-auto scrollbar-thin">
        <div className="relative min-w-[720px] px-5 pb-6">
          {/* 날짜 눈금 */}
          <div className="relative ml-[148px] h-12">
            {ticks.map((t) => (
              <span key={t} className="absolute top-5 -translate-x-1/2 whitespace-nowrap font-mono text-[11px] text-fg-4" style={{ left: x(t) }}>
                {fmtDay(t)}
              </span>
            ))}
            {/* 지금 */}
            <span className="absolute top-0 z-10 -translate-x-1/2" style={{ left: x(now) }}>
              <span className="mx-auto block size-0 border-x-[5px] border-t-[6px] border-x-transparent border-t-accent" />
              <span className="mt-1 block rounded-md bg-accent/90 px-1.5 py-0.5 font-mono text-[10.5px] text-on-accent shadow-[0_0_14px_var(--accent-glow)]">Now</span>
            </span>
          </div>

          <div className="relative">
            {/* 세로 격자 + 지금 선 */}
            <div className="pointer-events-none absolute inset-y-0 left-[148px] right-0">
              {ticks.map((t) => (
                <span key={t} className="absolute inset-y-0 w-px bg-white/[0.035]" style={{ left: x(t) }} />
              ))}
              <span className="absolute inset-y-0 w-px bg-accent/80 shadow-[0_0_10px_var(--accent-glow)]" style={{ left: x(now) }} />
            </div>

            <ul className="relative flex flex-col gap-2.5">
              {rows.map(({ c, from, to }, i) => {
                // 막대가 짧으면 이름표를 막대 오른쪽 바깥에
                const narrow = (to - from) / total < 0.16;
                const label = c.assignee?.name ?? CUT_STATUS_LABEL[c.status];
                return (
                <li key={c.id} className="grid grid-cols-[148px_minmax(0,1fr)] items-center">
                  <button type="button" onClick={() => onOpen(c.id)} className="min-w-0 pr-3 text-left">
                    <span className={cn("block truncate text-[12.5px] text-fg hover:text-accent", isCodeLike(c.code) ? "font-mono tracking-[0.02em]" : "font-medium")} title={c.code}>
                      {c.code}
                    </span>
                    <span className="block truncate text-[11px] text-fg-4">{c.title || CUT_STATUS_LABEL[c.status]}</span>
                  </button>
                  <div className="relative h-10">
                    <motion.button
                      type="button"
                      onClick={() => onOpen(c.id)}
                      title={`${c.code} · ${CUT_STATUS_LABEL[c.status]} · 테이크 ${c.counts.takes}`}
                      initial={{ opacity: 0, scaleX: 0.3 }}
                      animate={{ opacity: 1, scaleX: 1 }}
                      transition={{ duration: 0.7, delay: 0.1 + i * 0.05, ease: EASE }}
                      className={cn(
                        "absolute top-1 flex h-8 origin-left items-center gap-2 overflow-hidden rounded-[10px] text-[12.5px] font-medium transition hover:brightness-110",
                        narrow ? "justify-center px-1" : "justify-between pl-3 pr-1.5",
                        BAR[c.status],
                      )}
                      style={{ left: x(from), width: w(from, to) }}
                    >
                      {narrow ? (
                        c.counts.takes > 0 && <span className="font-mono text-[10.5px] font-normal">{c.counts.takes}</span>
                      ) : (
                        <>
                          <span className="truncate">{label}</span>
                          {c.counts.takes > 0 && <span className={cn("shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[10.5px] font-normal", BADGE[c.status])}>{c.counts.takes} takes</span>}
                        </>
                      )}
                    </motion.button>
                    {narrow && (
                      <span className="pointer-events-none absolute top-1 flex h-8 items-center whitespace-nowrap pl-2 text-[12px] text-fg-3" style={{ left: `calc(${x(to)} + max(${((to - from) / total) * 100}%, 34px) - ${((to - from) / total) * 100}%)` }}>
                        {label}
                        {c.counts.takes > 0 && <span className="ml-2 font-mono text-[10.5px] text-fg-4">{c.counts.takes} takes</span>}
                      </span>
                    )}
                    {/* OK 점 */}
                    {c.okAt.map((t, k) => (
                      <span
                        key={k}
                        className="pointer-events-none absolute top-0 size-1.5 -translate-x-1/2 rounded-full bg-success shadow-[0_0_6px_var(--success)]"
                        style={{ left: x(new Date(t).getTime()) }}
                      />
                    ))}
                    {c.active.length > 0 && (
                      <span className="pointer-events-none absolute top-[14px] size-2 -translate-x-1/2 rounded-full bg-accent shadow-[0_0_10px_var(--accent-glow)]" style={{ left: x(now) }}>
                        <span className="absolute inset-0 animate-ping rounded-full bg-accent opacity-70" />
                      </span>
                    )}
                  </div>
                </li>
                );
              })}
            </ul>
          </div>

          {/* 범례 */}
          <div className="ml-[148px] mt-5 flex flex-wrap items-center gap-4 text-[11px] text-fg-4">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-5 rounded-[4px] bg-[linear-gradient(90deg,var(--accent-deep),var(--accent))]" /> 작업 중
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-5 rounded-[4px] border border-info/60 bg-info/12" /> 검토
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-5 rounded-[4px] bg-inv" /> 확정
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-5 rounded-[4px] border border-line-2 bg-white/[0.04]" /> 대기
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-success" /> OK
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
