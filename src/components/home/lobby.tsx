"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { LogoFull } from "@/components/brand/logo";
import { AxisGizmo, CountUp, Marquee, RecDot, Reveal, Timecode, trackSpotlight } from "@/components/brand/motion";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/* ---------------------------------- 슬레이트 ---------------------------------- */

/** 히어로 맨 위 촬영 슬레이트 줄: REC · 타임코드 · 씬 · 테이크 */
export function HeroSlate({ scene, take }: { scene: string; take: number }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-white/10 pb-4 font-mono text-[10.5px] uppercase tracking-[0.2em] text-fg-3">
      <RecDot className="text-[#ff6b61]" />
      <Timecode className="text-[12px] tracking-[0.08em] text-fg" />
      <span>
        Scene <b className="font-semibold text-fg-2">{scene}</b>
      </span>
      <span>
        Take <b className="font-semibold text-fg-2">{pad(take)}</b>
      </span>
      <span className="ml-auto hidden items-center gap-3 lg:flex">
        {BRAND.name} — {BRAND.role}
        <AxisGizmo className="size-8 text-fg-3" />
      </span>
    </div>
  );
}

/* ---------------------------------- 숫자 ---------------------------------- */

export type LobbyStats = { mine: number; total: number; videos: number; directors: number };

export function HeroStats({ stats }: { stats: LobbyStats }) {
  const items = [
    { label: "My takes", sub: "이번 달 내 생성", value: stats.mine },
    { label: "Studio takes", sub: "이번 달 스튜디오 전체", value: stats.total },
    { label: "Video", sub: "이번 달 영상 테이크", value: stats.videos },
    { label: "Directors", sub: "이번 달 작업한 사람", value: stats.directors },
  ];
  return (
    <dl className="grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-4 sm:gap-y-6 xl:grid-cols-2 xl:gap-x-10">
      {items.map((it, i) => (
        <Reveal key={it.label} delay={0.25 + i * 0.07} className="min-w-[120px]">
          <dt className="font-mono text-[10px] uppercase tracking-[0.2em] text-fg-4">{it.label}</dt>
          <dd className="mt-2 font-serif text-[38px] leading-none tracking-[-0.02em] text-fg sm:text-[46px]">
            <CountUp value={it.value} />
          </dd>
          <dd className="mt-1.5 text-[11.5px] text-fg-3">{it.sub}</dd>
        </Reveal>
      ))}
    </dl>
  );
}

/* ---------------------------------- 카메라 카드 ---------------------------------- */

/** 바로가기 카드 — 촬영장의 A·B·C 카메라처럼 */
export function CamCard({
  href,
  cam,
  icon,
  title,
  desc,
  glow,
  index,
}: {
  href: string;
  cam: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
  glow: string;
  index: number;
}) {
  return (
    <Reveal delay={0.35 + index * 0.08}>
      <Link
        href={href}
        onPointerMove={trackSpotlight}
        className="spotlight group relative flex h-full flex-col justify-between gap-7 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035] p-5 backdrop-blur-md transition duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.06]"
      >
        <span aria-hidden className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full opacity-40 blur-3xl transition-opacity duration-500 group-hover:opacity-80" style={{ background: glow }} />
        <span className="relative flex items-center justify-between font-mono text-[10.5px] uppercase tracking-[0.22em] text-fg-3">
          <span className="flex items-center gap-2">
            <span className="size-1.5 rounded-full" style={{ background: glow }} />
            {cam}
          </span>
          <ArrowUpRight className="size-4 transition duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-fg" />
        </span>
        <span className="relative flex items-end gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-inv text-inv-fg shadow-[0_10px_30px_-10px_rgba(0,0,0,0.6)] transition duration-300 group-hover:scale-105 [&_svg]:size-[22px]">
            {icon}
          </span>
          <span className="min-w-0">
            <span className="block text-[17px] font-semibold tracking-[-0.01em]">{title}</span>
            <span className="block truncate text-[12px] text-fg-3">{desc}</span>
          </span>
        </span>
      </Link>
    </Reveal>
  );
}

/* ---------------------------------- 쇼릴 ---------------------------------- */

export type ReelFrame =
  | { type: "take"; id: string; thumb: string; prompt: string; userName: string }
  | { type: "slot"; id: string; gradient: string; name: string };

/** 필름 스트립처럼 흐르는 이번 주 결과물 (썸네일만 불러와 가벼워요) */
export function Showreel({ frames }: { frames: ReelFrame[] }) {
  return (
    <div data-theme="dark" className="relative overflow-hidden rounded-[22px] border border-line bg-[#09090a] py-2.5">
      <div className="sprockets" />
      <Marquee duration={Math.max(40, frames.length * 5)} className="my-2">
        {(clone) =>
          frames.map((f, i) => (
            <Frame key={`${f.id}-${clone ? "b" : "a"}`} frame={f} index={i} clone={clone} />
          ))
        }
      </Marquee>
      <div className="sprockets" />
      <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-[#09090a] to-transparent" />
      <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-[#09090a] to-transparent" />
    </div>
  );
}

function Frame({ frame, index, clone }: { frame: ReelFrame; index: number; clone: boolean }) {
  const clip = `A001_C${pad(index + 1, 3)}`;
  const box = "group relative mx-[5px] block h-[148px] w-[222px] shrink-0 overflow-hidden rounded-[5px] bg-panel-3 sm:h-[168px] sm:w-[252px]";
  if (frame.type === "slot") {
    return (
      <Link href="/create/image" tabIndex={clone ? -1 : undefined} className={box} style={{ background: frame.gradient }}>
        <span className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.35),transparent_60%)]" />
        <span className="absolute inset-0 bg-black/35" />
        <span className="absolute left-2.5 top-2 font-mono text-[9.5px] tracking-[0.16em] text-white/70">{clip}</span>
        <span className="absolute inset-x-3 bottom-3">
          <span className="block font-serif text-[22px] italic leading-none text-white">{frame.name}</span>
          <span className="mt-1 block text-[11px] text-white/70">다음 테이크를 기다리는 중</span>
        </span>
      </Link>
    );
  }
  return (
    <Link href={`/library?asset=${frame.id}`} tabIndex={clone ? -1 : undefined} className={box} title={frame.prompt}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={frame.thumb} alt="" loading="lazy" decoding="async" draggable={false} className="size-full object-cover transition duration-700 group-hover:scale-[1.06]" />
      <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/25" />
      <span className="absolute left-2.5 top-2 font-mono text-[9.5px] tracking-[0.16em] text-white/75">{clip}</span>
      <span className="absolute inset-x-2.5 bottom-2 flex items-end gap-2">
        <span className="line-clamp-1 flex-1 text-[11px] text-white/85 opacity-0 transition duration-300 group-hover:opacity-100">{frame.prompt}</span>
        <span className="shrink-0 font-mono text-[9.5px] uppercase tracking-[0.14em] text-white/60">{frame.userName}</span>
      </span>
    </Link>
  );
}

/* ---------------------------------- 섹션 머리 ---------------------------------- */

export function SectionHead({ index, title, accent, href }: { index: string; title: string; accent?: string; href?: string }) {
  return (
    <Reveal className="flex items-end justify-between gap-4 border-b border-line pb-3">
      <div className="flex min-w-0 items-baseline gap-3">
        <span className="section-index">{index}</span>
        <h2 className="text-[19px] font-semibold tracking-[-0.02em]">{title}</h2>
        {accent && <span className="hidden truncate font-serif text-[19px] italic text-fg-3 sm:inline">{accent}</span>}
      </div>
      {href && (
        <Link href={href} className="group flex shrink-0 items-center gap-1 text-[12.5px] text-fg-3 transition hover:text-fg">
          전체 보기 <ArrowUpRight className="size-3.5 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        </Link>
      )}
    </Reveal>
  );
}

/* ---------------------------------- 매니페스토 ---------------------------------- */

/** 우리가 누구인지 — 홈 맨 아래 크레딧처럼 */
export function Manifesto() {
  return (
    <section data-theme="dark" className="relative isolate overflow-hidden rounded-[28px] border border-line bg-[#060607] text-fg">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-40 top-1/3 size-[480px] animate-drift rounded-full bg-accent opacity-[0.12] blur-[130px]" />
        <div className="absolute -right-24 -top-24 size-[420px] animate-drift-slow rounded-full bg-[#3a2cff] opacity-[0.16] blur-[130px]" />
        <div className="grain-live" />
      </div>
      <div className="grid gap-10 p-7 sm:p-12 lg:grid-cols-[0.9fr_1.4fr] lg:gap-16">
        <Reveal className="flex flex-col justify-between gap-8">
          <div>
            <p className="section-index flex items-center gap-2">
              <span className="h-px w-5 bg-accent" /> MANIFESTO
            </p>
            <LogoFull className="mt-7 w-[min(300px,80%)] text-fg" />
          </div>
          <p className="max-w-sm break-keep text-[15px] leading-relaxed text-fg-2">{BRAND.statement}</p>
        </Reveal>
        <ol className="grid overflow-hidden rounded-2xl border border-white/10 sm:grid-cols-2">
          {BRAND.principles.map((p, i) => (
            <Reveal
              as="li"
              key={p.en}
              delay={i * 0.08}
              className={cn(
                "group relative flex min-h-[190px] flex-col justify-between gap-6 border-white/10 bg-white/[0.02] p-6 transition-colors duration-500 hover:bg-white/[0.05]",
                i % 2 === 0 && "sm:border-r",
                i < 3 && "border-b",
                i === 2 && "sm:border-b-0",
              )}
            >
              <span className="section-index">{pad(i + 1)}</span>
              <div>
                <p className="font-serif text-[44px] italic leading-none tracking-[-0.02em] transition-colors duration-500 group-hover:text-accent-2">{p.en}</p>
                <p className="mt-3 break-keep text-[13.5px] leading-relaxed text-fg-3">{p.ko}</p>
              </div>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}
