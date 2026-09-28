"use client";

import { ArrowUpRight } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import * as React from "react";

import { MediaThumb } from "@/components/assets/media";
import { VerdictBadge, VERDICT_STYLE } from "@/components/assets/selection-controls";
import { RollingNumber } from "@/components/brand/motion";
import { Avatar, TimeAgo } from "@/components/ui/misc";
import { getModel } from "@/lib/models/registry";
import type { HomeBoard, HomeCut, HomeProject, HomeTake } from "@/lib/services/home";
import { CUT_STATUS_LABEL, type CutStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const EASE = [0.2, 0.8, 0.2, 1] as const;
const pad = (n: number) => String(n).padStart(2, "0");
const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
const DAYS_EN = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

/* ---------------------------------- 머리 ---------------------------------- */

/** 오늘 날짜와 현황 숫자 (숫자는 자리마다 굴러가며 나타나요) */
export function StatusBand({ stats, backdrop, date }: { stats: HomeBoard["stats"]; backdrop: string | null; date: { m: number; d: number; wd: number; y: number } }) {
  const items = [
    { label: "진행 중인 컷", value: stats.activeCuts },
    { label: "오늘 테이크", value: stats.todayTakes },
    { label: "이번 달 OK", value: stats.monthOk, tone: "text-success" },
    { label: "지금 생성 중", value: stats.generating, live: stats.generating > 0 },
  ];
  return (
    <section className="relative isolate">
      {backdrop && (
        <div aria-hidden className="pointer-events-none absolute -inset-x-8 -top-10 bottom-0 -z-10 overflow-hidden [mask-image:linear-gradient(to_bottom,black,transparent_92%)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={backdrop} alt="" className="size-full scale-125 object-cover opacity-[0.22] blur-[60px] saturate-150" />
        </div>
      )}
      <div className="flex items-center justify-between gap-4 font-mono text-[10.5px] uppercase tracking-[0.2em] text-fg-3">
        <span>
          Creation Zipup <span className="px-1 text-fg-4">/</span> <span className="font-sans text-[11.5px] normal-case tracking-normal text-fg-2">제작 현황</span>
        </span>
        <Clock />
      </div>
      <div className="mt-6 grid gap-10 border-b border-line pb-10 lg:grid-cols-[auto_1fr] lg:items-end lg:gap-16">
        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: EASE }}
          className="flex items-end gap-4 font-display font-light leading-[0.82] tracking-[-0.05em]"
        >
          <span className="text-[88px] sm:text-[120px]">
            {pad(date.m)}.{pad(date.d)}
          </span>
          <span className="mb-2 flex flex-col gap-1 font-mono text-[12px] font-normal leading-none tracking-[0.2em] text-fg-3">
            <span className="text-fg">{DAYS_EN[date.wd]}</span>
            <span>{date.y}</span>
            <span className="font-sans tracking-normal">{DAYS[date.wd]}요일</span>
          </span>
        </motion.h1>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-4 lg:justify-self-end">
          {items.map((it, i) => (
            <motion.div key={it.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.15 + i * 0.07, ease: EASE }} className="min-w-[112px]">
              <dt className="flex items-center gap-1.5 text-[12px] text-fg-3">
                {it.live && (
                  <span className="relative flex size-1.5">
                    <span className="absolute inset-0 animate-ping rounded-full bg-accent opacity-60" />
                    <span className="relative size-1.5 rounded-full bg-accent" />
                  </span>
                )}
                {it.label}
              </dt>
              <dd className={cn("mt-2 font-display text-[44px] font-light leading-none tracking-[-0.03em]", it.tone)}>
                <RollingNumber value={it.value} />
              </dd>
            </motion.div>
          ))}
        </dl>
      </div>
    </section>
  );
}

/** 한국 시간 시계 (초마다 글자만 바꿔요) */
function Clock() {
  const ref = React.useRef<HTMLSpanElement>(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const tick = () => {
      const k = new Date(Date.now() + 9 * 3600_000);
      el.textContent = `KST ${pad(k.getUTCHours())}:${pad(k.getUTCMinutes())}:${pad(k.getUTCSeconds())}`;
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);
  return <span ref={ref} className="tabular-nums" suppressHydrationWarning />;
}

/* ---------------------------------- 섹션 머리 ---------------------------------- */

export function Section({ index, title, href, hrefLabel = "전체", children, className, aside }: { index: string; title: string; href?: string; hrefLabel?: string; children: React.ReactNode; className?: string; aside?: React.ReactNode }) {
  return (
    <section className={cn("flex min-w-0 flex-col gap-4", className)}>
      <header className="flex items-baseline justify-between gap-4 border-b border-line pb-3">
        <h2 className="flex items-baseline gap-3">
          <span className="font-mono text-[11px] tracking-[0.12em] text-fg-4">{index}</span>
          <span className="text-[15px] font-semibold tracking-[-0.01em]">{title}</span>
          {aside}
        </h2>
        {href && (
          <Link href={href} className="group flex items-center gap-1 text-[12.5px] text-fg-3 transition hover:text-fg">
            {hrefLabel} <ArrowUpRight className="size-3.5 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </Link>
        )}
      </header>
      {children}
    </section>
  );
}

/* ---------------------------------- 진행 중인 컷 ---------------------------------- */

const STATUS_DOT: Record<CutStatus, string> = { todo: "bg-fg-4", wip: "bg-accent", review: "bg-info", done: "bg-success" };

export function ActiveCuts({ cuts }: { cuts: HomeCut[] }) {
  if (!cuts.length) {
    return (
      <p className="py-6 text-[13px] leading-relaxed text-fg-3">
        작업 중이거나 검토 중인 컷이 없어요. 프로젝트에서 컷을 나누고 생성하면 여기에 모여요.{" "}
        <Link href="/projects" className="text-fg underline underline-offset-4">
          프로젝트
        </Link>
      </p>
    );
  }
  return (
    <ul className="flex flex-col">
      {cuts.map((c, i) => (
        <motion.li key={c.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.45, delay: 0.1 + i * 0.04, ease: EASE }}>
          <Link
            href={`/projects/${c.projectId}?tab=cuts&cut=${c.id}`}
            className="group grid grid-cols-[1fr_auto] items-center gap-4 border-b border-line py-3.5 transition-colors hover:bg-panel/50 sm:grid-cols-[minmax(0,1fr)_auto_auto]"
          >
            <span className="flex min-w-0 items-center gap-3">
              <span className="w-[64px] shrink-0 font-mono text-[14px] font-semibold tracking-[0.03em] transition group-hover:text-accent">{c.code}</span>
              <span className="min-w-0">
                <span className="block truncate text-[13.5px] font-medium">{c.title || <span className="text-fg-4">제목 없음</span>}</span>
                <span className="flex items-center gap-2 truncate text-[11.5px] text-fg-4">
                  <span className="size-1.5 shrink-0 rounded-full" style={{ background: c.projectColor ?? "var(--fg-4)" }} />
                  {c.projectName}
                  <span className="text-fg-4">·</span>
                  <span className="flex items-center gap-1">
                    <span className={cn("size-1.5 rounded-full", STATUS_DOT[c.status])} />
                    {CUT_STATUS_LABEL[c.status]}
                  </span>
                  {c.assignee && (
                    <>
                      <span>·</span>
                      <span className={cn(c.mine && "text-fg-2")}>{c.mine ? "내 담당" : c.assignee}</span>
                    </>
                  )}
                </span>
              </span>
            </span>
            <span className="hidden items-center gap-1 sm:flex">
              {c.recent.map((t) => (
                <span key={t.id} className="relative block h-8 w-11 overflow-hidden rounded-[4px] bg-panel-3">
                  {t.kind === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.thumb} alt="" loading="lazy" className="size-full object-cover" />
                  ) : (
                    <span className="absolute inset-0 flex items-center justify-center font-mono text-[8px] text-fg-4">MOV</span>
                  )}
                  {t.flag && <span className={cn("absolute inset-x-0 bottom-0 h-[3px]", VERDICT_STYLE[t.flag].solid)} />}
                </span>
              ))}
            </span>
            <span className="flex min-w-[92px] flex-col items-end gap-0.5 text-right">
              {c.live.length > 0 ? (
                <span className="flex items-center gap-1.5 text-[11.5px] text-accent">
                  <span className="size-1.5 animate-pulse-dot rounded-full bg-accent" />
                  {c.live[0]}
                  {c.live.length > 1 && ` 외 ${c.live.length - 1}`}
                </span>
              ) : (
                <span className="text-[11px] text-fg-4">
                  <TimeAgo date={c.lastActivityAt} />
                </span>
              )}
              <span className="font-mono text-[10.5px] text-fg-4">
                T{c.takes} · <span className={c.ok ? "text-success" : undefined}>OK {c.ok}</span>
              </span>
            </span>
          </Link>
        </motion.li>
      ))}
    </ul>
  );
}

/* ---------------------------------- 지금 생성 중 ---------------------------------- */

export function LiveNow({ live }: { live: HomeBoard["live"] }) {
  if (!live.length) return <p className="py-3 text-[12.5px] text-fg-4">지금 생성 중인 사람이 없어요.</p>;
  return (
    <ul className="flex flex-col gap-2.5">
      {live.map((l, i) => (
        <li key={i} className="flex items-center gap-2.5">
          <Avatar name={l.userName} size={24} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12.5px]">
              {l.userName} <span className="text-fg-4">· {getModel(l.modelId)?.shortName ?? l.modelId}</span>
            </span>
            <span className="block truncate font-mono text-[10.5px] text-fg-4">
              {l.projectName}
              {l.cutCode ? ` / ${l.cutCode}` : ""}
            </span>
          </span>
          <span className="size-1.5 animate-pulse-dot rounded-full bg-accent" />
        </li>
      ))}
    </ul>
  );
}

/* ---------------------------------- 프로젝트 진행 ---------------------------------- */

export function ProjectProgress({ projects }: { projects: HomeProject[] }) {
  if (!projects.length) return <p className="py-3 text-[12.5px] text-fg-4">함께 쓰는 프로젝트가 아직 없어요.</p>;
  return (
    <ul className="flex flex-col gap-4">
      {projects.map((p, i) => {
        const total = p.cuts.todo + p.cuts.wip + p.cuts.review + p.cuts.done;
        const seg: [CutStatus, number][] = [
          ["done", p.cuts.done],
          ["review", p.cuts.review],
          ["wip", p.cuts.wip],
          ["todo", p.cuts.todo],
        ];
        return (
          <li key={p.id}>
            <Link href={`/projects/${p.id}`} className="group block">
              <span className="flex items-baseline justify-between gap-3">
                <span className="truncate text-[13px] font-medium group-hover:underline group-hover:underline-offset-4">{p.name}</span>
                <span className="shrink-0 font-mono text-[10.5px] text-fg-4">
                  {total ? `${p.cuts.done}/${total} 컷` : `${p.takes} 테이크`}
                </span>
              </span>
              <span className="mt-2 flex h-[5px] w-full gap-[2px] overflow-hidden rounded-full bg-panel-3">
                {total
                  ? seg
                      .filter(([, n]) => n > 0)
                      .map(([s, n]) => (
                        <motion.span
                          key={s}
                          initial={{ scaleX: 0 }}
                          animate={{ scaleX: 1 }}
                          transition={{ duration: 0.9, delay: 0.2 + i * 0.06, ease: EASE }}
                          className={cn("h-full origin-left rounded-full", STATUS_DOT[s], s === "todo" && "opacity-40")}
                          style={{ width: `${(n / total) * 100}%` }}
                        />
                      ))
                  : null}
              </span>
              <span className="mt-1.5 flex items-center gap-3 text-[10.5px] text-fg-4">
                {total > 0 && (
                  <>
                    <span>확정 {p.cuts.done}</span>
                    <span>검토 {p.cuts.review}</span>
                    <span>작업 중 {p.cuts.wip}</span>
                  </>
                )}
                <span className="ml-auto">
                  <TimeAgo date={p.lastActivityAt} />
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/* ---------------------------------- 테이크 그리드 ---------------------------------- */

export function TakeGrid({ takes, big = false }: { takes: HomeTake[]; big?: boolean }) {
  // 크게 보여줄 첫 장은 테이크가 넉넉할 때만
  const feature = big && takes.length >= 4;
  return (
    <div className={cn("grid gap-3", big ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-3 sm:grid-cols-5 lg:grid-cols-10")}>
      {takes.map((t, i) => (
        <motion.div
          key={t.id}
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "0px 0px -5% 0px" }}
          transition={{ duration: 0.6, delay: Math.min(i, 9) * 0.04, ease: EASE }}
          className={cn(feature && i === 0 && "col-span-2 row-span-2")}
        >
          <Link
            href={`/library?asset=${t.id}`}
            className={cn("group relative block overflow-hidden rounded-xl bg-panel-2", big ? (feature && i === 0 ? "aspect-square lg:aspect-[4/3.05]" : "aspect-[4/3]") : "aspect-square")}
          >
            <MediaThumb kind={t.kind} thumb={t.urls.thumb} src={t.urls.src} durationSec={big ? t.durationSec : null} className="transition duration-700 group-hover:scale-[1.04]" />
            {big && (
              <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end gap-2 bg-gradient-to-t from-black/75 to-transparent px-3 pb-2.5 pt-10 opacity-90 transition group-hover:opacity-100">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-[10px] tracking-[0.08em] text-white/85">
                    {t.projectName}
                    {t.cutCode ? ` / ${t.cutCode}` : ""}
                    {t.take ? ` · T${pad(t.take)}` : ""}
                  </span>
                  <span className="block truncate text-[11px] text-white/60">{t.userName}</span>
                </span>
                <VerdictBadge flag={t.flag} />
              </span>
            )}
            {!big && t.flag && <span className={cn("absolute inset-x-0 bottom-0 h-[3px]", VERDICT_STYLE[t.flag].solid)} />}
          </Link>
        </motion.div>
      ))}
    </div>
  );
}
