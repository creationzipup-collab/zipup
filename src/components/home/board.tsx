"use client";

import { motion } from "motion/react";
import Link from "next/link";
import * as React from "react";

import { MediaThumb } from "@/components/assets/media";
import { VerdictBadge, VERDICT_STYLE } from "@/components/assets/selection-controls";
import { AmbientVideo } from "@/components/brand/ambient-video";
import { LiveDot, Pill } from "@/components/brand/hud";
import { HeroPrompt } from "@/components/home/hero-prompt";
import { TimeAgo } from "@/components/ui/misc";
import type { HomeBoard, HomeCut, HomeTake } from "@/lib/services/home";
import { CUT_STATUS_LABEL, type CutStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const EASE = [0.2, 0.8, 0.2, 1] as const;
const pad = (n: number) => String(n).padStart(2, "0");
const DAYS_EN = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

export const STATUS_DOT: Record<CutStatus, string> = { todo: "bg-fg-4", wip: "bg-accent", review: "bg-info", done: "bg-success" };
export const STATUS_PILL: Record<CutStatus, "line" | "accent" | "review" | "ok"> = { todo: "line", wip: "accent", review: "review", done: "ok" };

/* ---------------------------------------------------------------------------------------------- */
/*                                   히어로: 영상 + 오늘 + 프롬프트                                   */
/* ---------------------------------------------------------------------------------------------- */

type RecentPrompt = { id: string; title: string; prompt: string; kind: "image" | "video" | "any" };

/** 영상 한 장면 위에 오늘 날짜와 프롬프트만. 숫자판은 두지 않아요. */
export function HomeHero({ date, recent, generating }: { date: HomeBoard["today"]; recent: RecentPrompt[]; generating: number }) {
  const reveal = (i: number) => ({
    initial: { opacity: 0, y: 18, filter: "blur(8px)" },
    animate: { opacity: 1, y: 0, filter: "blur(0px)" },
    transition: { duration: 0.9, delay: 0.2 + i * 0.1, ease: EASE },
  });
  return (
    <section className="relative isolate -mt-14 overflow-hidden border-b border-line">
      <AmbientVideo />
      <div className="relative mx-auto flex min-h-[min(88vh,840px)] w-full max-w-[1480px] flex-col justify-between px-4 pb-10 pt-[78px] sm:px-8 sm:pb-12">
        <div className="flex items-center justify-between gap-4 font-mono text-[10.5px] uppercase tracking-[0.22em] text-white/55">
          <span>Creation Zipup</span>
          <span className="flex items-center gap-3">
            {generating > 0 && (
              <span className="flex items-center gap-2 normal-case tracking-normal text-white/80">
                <LiveDot className="size-1.5" /> {generating}건 생성 중
              </span>
            )}
            <Clock className="dotnum text-[15px] tracking-[0.06em] text-white/85" />
          </span>
        </div>

        <div className="flex max-w-[820px] flex-col gap-7">
          <motion.div {...reveal(0)}>
            <p className="font-mono text-[11px] tracking-[0.32em] text-white/60">
              {DAYS_EN[date.wd]} · {date.y}
            </p>
            <h1 className="num mt-3 text-[clamp(84px,11vw,160px)] text-white [text-shadow:0_2px_40px_rgb(0_0_0/0.3)]">
              {pad(date.m)}.{pad(date.d)}
            </h1>
          </motion.div>
          <motion.div {...reveal(1)}>
            <HeroPrompt recent={recent} />
          </motion.div>
        </div>
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
      <p className="border-t border-line py-6 text-[13px] text-fg-3">
        작업 중이거나 검토 중인 컷이 없어요. 프로젝트에서 컷을 나누고 생성하면 여기에 모여요.{" "}
        <Link href="/projects" className="text-fg underline underline-offset-4 hover:text-accent">
          프로젝트
        </Link>
      </p>
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
