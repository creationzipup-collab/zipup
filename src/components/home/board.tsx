"use client";

import { motion } from "motion/react";
import Link from "next/link";
import * as React from "react";

import { MediaThumb } from "@/components/assets/media";
import { VerdictBadge, VERDICT_STYLE } from "@/components/assets/selection-controls";
import { AmbientVideo } from "@/components/brand/ambient-video";
import { Frame, Histogram, LiveDot, Metric, Pill, RingGauge, SegmentBar, Ticker } from "@/components/brand/hud";
import { HeroPrompt } from "@/components/home/hero-prompt";
import { useShell } from "@/components/shell/app-shell";
import { Avatar, TimeAgo } from "@/components/ui/misc";
import { getModel } from "@/lib/models/registry";
import type { HomeBoard, HomeCut, HomeProject, HomeTake } from "@/lib/services/home";
import { CUT_STATUS_LABEL, type CutStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const EASE = [0.2, 0.8, 0.2, 1] as const;
const pad = (n: number) => String(n).padStart(2, "0");
const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
const DAYS_EN = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

export const STATUS_DOT: Record<CutStatus, string> = { todo: "bg-fg-4", wip: "bg-accent", review: "bg-info", done: "bg-success" };
export const STATUS_PILL: Record<CutStatus, "line" | "accent" | "review" | "ok"> = { todo: "line", wip: "accent", review: "review", done: "ok" };

/* ---------------------------------------------------------------------------------------------- */
/*                                         히어로 (영상 위 계기판)                                    */
/* ---------------------------------------------------------------------------------------------- */

type RecentPrompt = { id: string; title: string; prompt: string; kind: "image" | "video" | "any" };

export function HomeHero({
  stats,
  daily,
  date,
  recent,
}: {
  stats: HomeBoard["stats"];
  daily: HomeBoard["daily"];
  date: HomeBoard["today"];
  recent: RecentPrompt[];
}) {
  const { budget } = useShell();
  const okRate = stats.monthTakes ? Math.min(1, stats.monthOk / stats.monthTakes) : 0;
  const values = daily.map((d) => d.value);
  const today = values[values.length - 1] ?? 0;
  const max = Math.max(0, ...values);
  const avg = values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;

  const reveal = (i: number) => ({
    initial: { opacity: 0, y: 14, filter: "blur(6px)" },
    animate: { opacity: 1, y: 0, filter: "blur(0px)" },
    transition: { duration: 0.8, delay: 0.25 + i * 0.08, ease: EASE },
  });

  return (
    <section className="relative isolate -mt-14 overflow-hidden border-b border-line">
      <AmbientVideo />
      <div className="relative mx-auto flex min-h-[min(88vh,820px)] w-full max-w-[1480px] flex-col px-4 pb-7 pt-[76px] sm:px-8">
        {/* 윗줄: 위치 + 시계 */}
        <div className="flex items-center justify-between gap-4 font-mono text-[10.5px] uppercase tracking-[0.2em] text-white/60">
          <span className="truncate">
            Creation Zipup <span className="px-1 text-white/30">/</span>
            <span className="font-sans text-[12px] normal-case tracking-normal text-white/85">제작 현황</span>
          </span>
          <span className="flex items-center gap-2.5">
            <span className="hidden sm:inline">KST</span>
            <Clock className="dotnum text-[15px] tracking-[0.06em] text-white/90" />
          </span>
        </div>

        <div className="mt-6 grid flex-1 grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-[292px_minmax(0,1fr)_292px]">
          {/* 가운데: 오늘 */}
          <motion.div {...reveal(0)} className="col-span-2 flex flex-col items-center justify-center py-8 text-center lg:col-span-1 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:py-0">
            <Pill tone="line" className="border-white/25 bg-black/20 text-white/85 backdrop-blur-md">
              {stats.generating > 0 ? (
                <>
                  <LiveDot /> 지금 {stats.generating}건 생성 중
                </>
              ) : (
                <>{DAYS[date.wd]}요일</>
              )}
            </Pill>
            <h1 className="num mt-5 text-[clamp(88px,12vw,176px)] text-white [text-shadow:0_2px_40px_rgb(0_0_0/0.35)]">
              {pad(date.m)}.{pad(date.d)}
            </h1>
            <p className="mt-3 font-mono text-[11px] tracking-[0.3em] text-white/70">
              {DAYS_EN[date.wd]} · {date.y}
            </p>
          </motion.div>

          {/* 왼쪽 */}
          <motion.div {...reveal(1)} className="lg:col-start-1 lg:row-start-1">
            <Frame variant="glass" className="h-full" bodyClassName="grid grid-cols-2 gap-0 p-0">
              <div className="border-r border-white/10 p-4">
                <Metric value={stats.activeCuts} unit="cuts" label="진행 중인 컷" size="md" />
              </div>
              <div className="p-4">
                <Metric value={stats.todayTakes} unit="takes" label="오늘 테이크" size="md" />
              </div>
            </Frame>
          </motion.div>
          <motion.div {...reveal(2)} className="col-span-2 sm:col-span-1 lg:col-start-1 lg:row-start-2">
            <Frame variant="glass" className="h-full" label="이번 달 OK율" aside={<span className="font-mono">{stats.monthTakes} TAKES</span>}>
              <div className="flex flex-1 items-center justify-center gap-4">
                <RingGauge value={okRate} size={148} label={`OK율 ${Math.round(okRate * 100)}%`}>
                  <span className="num flex items-start text-[40px] text-white">
                    <Ticker value={okRate * 100} format="pct" />
                    <span className="num-unit mt-1">%</span>
                  </span>
                  <span className="mt-1 text-[10.5px] text-fg-3">OK / 전체</span>
                </RingGauge>
                <ul className="flex flex-col gap-2 text-[11.5px]">
                  <li className="flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-success" />
                    <span className="w-9 text-fg-3">OK</span>
                    <span className="font-mono text-fg">{stats.monthOk}</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-warning" />
                    <span className="w-9 text-fg-3">KEEP</span>
                    <span className="font-mono text-fg">{stats.monthKeep}</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-danger" />
                    <span className="w-9 text-fg-3">NG</span>
                    <span className="font-mono text-fg">{stats.monthNg}</span>
                  </li>
                </ul>
              </div>
            </Frame>
          </motion.div>

          {/* 오른쪽 */}
          <motion.div {...reveal(3)} className="lg:col-start-3 lg:row-start-1">
            <Frame variant="glass" className="h-full" bodyClassName="grid grid-cols-2 gap-0 p-0">
              <div className="border-r border-white/10 p-4">
                <Metric
                  value={stats.generating}
                  label={
                    <span className="flex items-center gap-1.5">
                      {stats.generating > 0 && <LiveDot className="size-1.5" />}생성 중
                    </span>
                  }
                  size="md"
                  tone={stats.generating > 0 ? "accent" : "fg"}
                />
              </div>
              <div className="p-4">
                <Metric value={budget.user.spent} format="usd" label="이번 달 내 사용" size="md" className="[&_.num]:text-[34px]" />
              </div>
            </Frame>
          </motion.div>
          <motion.div {...reveal(4)} className="col-span-2 sm:col-span-1 lg:col-start-3 lg:row-start-2">
            <Frame
              variant="glass"
              className="h-full"
              label="최근 14일 테이크"
              aside={
                <span className="font-mono">
                  {daily[0]?.label} — {daily[daily.length - 1]?.label}
                </span>
              }
            >
              <div className="mt-auto flex flex-col gap-4 pt-8">
                <Histogram data={daily} height={64} unit="개" />
                <dl className="grid grid-cols-3 gap-2 border-t border-white/10 pt-3 text-[11px]">
                  <div>
                    <dt className="text-fg-4">평균</dt>
                    <dd className="mt-0.5 font-mono text-[13px] text-fg">{avg.toFixed(1)}</dd>
                  </div>
                  <div>
                    <dt className="text-fg-4">오늘</dt>
                    <dd className="mt-0.5 font-mono text-[13px] text-accent">{today}</dd>
                  </div>
                  <div>
                    <dt className="text-fg-4">최고</dt>
                    <dd className="mt-0.5 font-mono text-[13px] text-fg">{max}</dd>
                  </div>
                </dl>
              </div>
            </Frame>
          </motion.div>
        </div>

        <motion.div {...reveal(5)} className="mx-auto mt-6 w-full max-w-[800px]">
          <HeroPrompt recent={recent} />
        </motion.div>
      </div>
    </section>
  );
}

/** 한국 시간 시계 (초마다 글자만 바꿔요) */
function Clock({ className }: { className?: string }) {
  const ref = React.useRef<HTMLSpanElement>(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const tick = () => {
      const k = new Date(Date.now() + 9 * 3600_000);
      el.textContent = `${pad(k.getUTCHours())}:${pad(k.getUTCMinutes())}:${pad(k.getUTCSeconds())}`;
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);
  return <span ref={ref} className={cn("tabular-nums", className)} suppressHydrationWarning />;
}

/* ---------------------------------------------------------------------------------------------- */
/*                                           진행 중인 컷                                           */
/* ---------------------------------------------------------------------------------------------- */

export function ActiveCuts({ cuts }: { cuts: HomeCut[] }) {
  if (!cuts.length) {
    return (
      <Frame variant="dashed" bodyClassName="py-10 items-center text-center">
        <p className="text-[13px] text-fg-2">작업 중이거나 검토 중인 컷이 없어요.</p>
        <p className="mt-1 text-[12px] text-fg-4">프로젝트에서 컷을 나누고 생성하면 여기에 모여요.</p>
        <Link href="/projects" className="mt-4 text-[12.5px] text-accent hover:underline hover:underline-offset-4">
          프로젝트 열기 →
        </Link>
      </Frame>
    );
  }
  return (
    <ul className="flex flex-col border-t border-line">
      {cuts.map((c, i) => (
        <motion.li key={c.id} initial={{ opacity: 0, x: -8 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.45, delay: i * 0.04, ease: EASE }}>
          <Link
            href={`/projects/${c.projectId}?tab=cuts&cut=${c.id}`}
            className="group relative grid grid-cols-[1fr_auto] items-center gap-4 border-b border-line py-3.5 pl-3 pr-2 transition-colors hover:bg-white/[0.022] sm:grid-cols-[minmax(0,1fr)_auto_auto]"
          >
            <span aria-hidden className="absolute inset-y-2 left-0 w-px origin-center scale-y-0 bg-accent shadow-[0_0_8px_var(--accent-glow)] transition-transform duration-300 group-hover:scale-y-100" />
            <span className="flex min-w-0 items-center gap-4">
              <span className="w-[68px] shrink-0 font-mono text-[15px] tracking-[0.02em] text-fg transition group-hover:text-accent">{c.code}</span>
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <span className="truncate text-[13.5px] font-medium">{c.title || <span className="text-fg-4">제목 없음</span>}</span>
                  <Pill tone={STATUS_PILL[c.status]} className="h-[19px] px-2 text-[10.5px]">
                    {CUT_STATUS_LABEL[c.status]}
                  </Pill>
                </span>
                <span className="mt-0.5 flex items-center gap-2 truncate text-[11.5px] text-fg-4">
                  <span className="size-1.5 shrink-0 rounded-full" style={{ background: c.projectColor ?? "var(--fg-4)" }} />
                  {c.projectName}
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
                <span key={t.id} className="relative block h-9 w-12 overflow-hidden rounded-[5px] bg-panel-3 ring-1 ring-white/5">
                  {t.kind === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.thumb} alt="" loading="lazy" className="size-full object-cover transition duration-500 group-hover:scale-105" />
                  ) : (
                    <span className="absolute inset-0 flex items-center justify-center font-mono text-[8px] text-fg-4">MOV</span>
                  )}
                  {t.flag && <span className={cn("absolute inset-x-0 bottom-0 h-[2px]", VERDICT_STYLE[t.flag].solid)} />}
                </span>
              ))}
            </span>
            <span className="flex min-w-[96px] flex-col items-end gap-1 text-right">
              {c.live.length > 0 ? (
                <span className="flex items-center gap-1.5 text-[11.5px] text-accent">
                  <LiveDot className="size-1.5" />
                  {c.live[0]}
                  {c.live.length > 1 && ` 외 ${c.live.length - 1}`}
                </span>
              ) : (
                <span className="text-[11px] text-fg-4">
                  <TimeAgo date={c.lastActivityAt} />
                </span>
              )}
              <span className="font-mono text-[10.5px] text-fg-4">
                T{pad(c.takes)} · <span className={c.ok ? "text-success" : undefined}>OK {c.ok}</span>
              </span>
            </span>
          </Link>
        </motion.li>
      ))}
    </ul>
  );
}

/* ---------------------------------------------------------------------------------------------- */
/*                                           지금 생성 중                                           */
/* ---------------------------------------------------------------------------------------------- */

export function LiveNow({ live }: { live: HomeBoard["live"] }) {
  if (!live.length) {
    return (
      <Frame variant="dashed" bodyClassName="py-6">
        <p className="text-[12.5px] text-fg-4">지금 생성 중인 사람이 없어요.</p>
      </Frame>
    );
  }
  return (
    <ul className="flex flex-col border-t border-line">
      {live.map((l, i) => (
        <li key={i} className="flex items-center gap-3 border-b border-line py-2.5">
          <Avatar name={l.userName} size={26} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12.5px]">
              {l.userName} <span className="text-fg-4">· {getModel(l.modelId)?.shortName ?? l.modelId}</span>
            </span>
            <span className="block truncate font-mono text-[10.5px] text-fg-4">
              {l.projectName}
              {l.cutCode ? ` / ${l.cutCode}` : ""}
            </span>
          </span>
          <LiveDot className="size-1.5" />
        </li>
      ))}
    </ul>
  );
}

/* ---------------------------------------------------------------------------------------------- */
/*                                           프로젝트 진행                                          */
/* ---------------------------------------------------------------------------------------------- */

export function ProjectProgress({ projects }: { projects: HomeProject[] }) {
  if (!projects.length) {
    return (
      <Frame variant="dashed" bodyClassName="py-6">
        <p className="text-[12.5px] text-fg-4">함께 쓰는 프로젝트가 아직 없어요.</p>
      </Frame>
    );
  }
  return (
    <ul className="flex flex-col border-t border-line">
      {projects.map((p) => {
        const total = p.cuts.todo + p.cuts.wip + p.cuts.review + p.cuts.done;
        return (
          <li key={p.id} className="border-b border-line">
            <Link href={`/projects/${p.id}`} className="group block py-3">
              <span className="flex items-baseline justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="size-1.5 shrink-0 rounded-full" style={{ background: p.color ?? "var(--fg-4)" }} />
                  <span className="truncate text-[13px] font-medium transition group-hover:text-accent">{p.name}</span>
                </span>
                <span className="shrink-0 font-mono text-[10.5px] text-fg-4">{total ? `${p.cuts.done}/${total} CUT` : `${p.takes} TAKE`}</span>
              </span>
              <SegmentBar
                className="mt-2.5"
                parts={[
                  { value: p.cuts.done, className: "bg-success", label: "확정" },
                  { value: p.cuts.review, className: "bg-info", label: "검토" },
                  { value: p.cuts.wip, className: "bg-accent shadow-[0_0_8px_var(--accent-glow)]", label: "작업 중" },
                  { value: p.cuts.todo, className: "bg-white/15", label: "대기" },
                ]}
              />
              <span className="mt-2 flex items-center gap-3 text-[10.5px] text-fg-4">
                {total > 0 && (
                  <>
                    <span>확정 {p.cuts.done}</span>
                    <span>검토 {p.cuts.review}</span>
                    <span>작업 {p.cuts.wip}</span>
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

/* ---------------------------------------------------------------------------------------------- */
/*                                           테이크 그리드                                          */
/* ---------------------------------------------------------------------------------------------- */

export function TakeGrid({ takes, big = false }: { takes: HomeTake[]; big?: boolean }) {
  // 크게 보여줄 첫 장은 테이크가 넉넉할 때만
  const feature = big && takes.length >= 4;
  return (
    <div className={cn("grid gap-2.5", big ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-3 sm:grid-cols-5 lg:grid-cols-10")}>
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
            className={cn(
              "group relative block overflow-hidden rounded-[10px] bg-panel-2 ring-1 ring-white/[0.06] transition hover:ring-white/20",
              big ? (feature && i === 0 ? "aspect-square lg:aspect-[4/3.05]" : "aspect-[4/3]") : "aspect-square",
            )}
          >
            <MediaThumb kind={t.kind} thumb={t.urls.thumb} src={t.urls.src} durationSec={big ? t.durationSec : null} className="transition duration-700 group-hover:scale-[1.04]" />
            {big && (
              <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end gap-2 bg-gradient-to-t from-black/80 to-transparent px-3 pb-2.5 pt-10">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-[10px] tracking-[0.08em] text-white/85">
                    {t.projectName}
                    {t.cutCode ? ` / ${t.cutCode}` : ""}
                    {t.take ? ` · T${pad(t.take)}` : ""}
                  </span>
                  <span className="block truncate text-[11px] text-white/55">{t.userName}</span>
                </span>
                <VerdictBadge flag={t.flag} />
              </span>
            )}
            {!big && t.flag && <span className={cn("absolute inset-x-0 bottom-0 h-[2px]", VERDICT_STYLE[t.flag].solid)} />}
          </Link>
        </motion.div>
      ))}
    </div>
  );
}
