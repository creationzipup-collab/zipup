import { and, desc, eq, gte, isNull, ne, notInArray, sql } from "drizzle-orm";
import { ArrowUpRight, Clapperboard, ImagePlus, Workflow } from "lucide-react";
import Link from "next/link";

import { MediaThumb } from "@/components/assets/media";
import { CyclingLines, Reveal, SplitWords, Viewfinder, ViewportGrid } from "@/components/brand/motion";
import { HeroPrompt } from "@/components/home/hero-prompt";
import { CamCard, HeroSlate, HeroStats, Manifesto, SectionHead, Showreel, type ReelFrame } from "@/components/home/lobby";
import { ModelSwatch } from "@/components/studio/model-picker";
import { Avatar, TimeAgo } from "@/components/ui/misc";
import { BRAND } from "@/lib/brand";
import { db } from "@/lib/db";
import { assets, favorites, generations, projects, promptPresets, user } from "@/lib/db/schema";
import { getModel, MODELS } from "@/lib/models/registry";
import { visibleProjectsWhere } from "@/lib/services/access";
import { assetUrls } from "@/lib/services/assets";
import { toListItems } from "@/lib/services/library";
import { requireActiveUser } from "@/lib/session";
import { cn } from "@/lib/utils";

export default async function HomePage() {
  const u = await requireActiveUser();
  const { monthStart, dayStart, scene } = kstBounds();

  const baseSelect = {
    a: assets,
    projectName: projects.name,
    userName: user.name,
    isFavorite: sql<boolean>`exists(select 1 from ${favorites} where ${favorites.userId} = ${u.id} and ${favorites.assetId} = ${assets.id})`,
  };
  const [mineRows, teamRows, projectRows, recentPrompts, [stats]] = await Promise.all([
    db
      .select(baseSelect)
      .from(assets)
      .innerJoin(projects, eq(projects.id, assets.projectId))
      .innerJoin(user, eq(user.id, assets.userId))
      .where(and(eq(assets.userId, u.id), isNull(assets.deletedAt)))
      .orderBy(desc(assets.createdAt))
      .limit(10),
    db
      .select(baseSelect)
      .from(assets)
      .innerJoin(projects, eq(projects.id, assets.projectId))
      .innerJoin(user, eq(user.id, assets.userId))
      .where(and(visibleProjectsWhere(u), ne(assets.userId, u.id), isNull(assets.deletedAt), eq(projects.isPersonal, false)))
      .orderBy(desc(assets.createdAt))
      .limit(12),
    db
      .select()
      .from(projects)
      .where(and(visibleProjectsWhere(u), isNull(projects.archivedAt)))
      .orderBy(desc(projects.lastActivityAt))
      .limit(6),
    db
      .select({ id: promptPresets.id, title: promptPresets.title, prompt: promptPresets.prompt, kind: promptPresets.kind })
      .from(promptPresets)
      .where(eq(promptPresets.userId, u.id))
      .orderBy(desc(promptPresets.updatedAt))
      .limit(4),
    // 이번 달 숫자 (내용은 보지 않고 개수만)
    db
      .select({
        mine: sql<number>`count(*) filter (where ${generations.userId} = ${u.id})::int`,
        total: sql<number>`count(*)::int`,
        videos: sql<number>`count(*) filter (where ${generations.kind} = 'video')::int`,
        directors: sql<number>`count(distinct ${generations.userId})::int`,
        today: sql<number>`count(distinct ${generations.batchId}) filter (where ${generations.userId} = ${u.id} and ${generations.createdAt} >= ${dayStart.toISOString()}::timestamptz)::int`,
      })
      .from(generations)
      .where(and(gte(generations.createdAt, monthStart), notInArray(generations.status, ["failed", "nsfw", "canceled"]))),
  ]);
  const [mine, team] = await Promise.all([toListItems(mineRows), toListItems(teamRows)]);
  const covers = await Promise.all(
    projectRows.map(async (p) => {
      if (!p.coverAssetId) return null;
      const [a] = await db.select().from(assets).where(eq(assets.id, p.coverAssetId));
      return a ? { kind: a.kind, urls: await assetUrls(a) } : null;
    }),
  );

  const reel = reelFrames([...team, ...mine]);
  const greet = kstGreeting();
  const title = u.jobTitle?.trim() || "디렉터";

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-14 px-4 py-8 sm:px-8 sm:py-10">
      {/* 히어로: 촬영장 모니터처럼 항상 어둡게 */}
      <section data-theme="dark" className="relative isolate overflow-hidden rounded-[28px] border border-white/10 bg-[#060607] text-fg shadow-[0_40px_120px_-60px_rgba(255,91,36,0.45)]">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -right-32 -top-52 size-[640px] animate-drift rounded-full bg-accent opacity-[0.2] blur-[130px]" />
          <div className="absolute -bottom-64 left-[8%] size-[600px] animate-drift-slow rounded-full bg-[#3a2cff] opacity-[0.24] blur-[140px]" />
          <div className="absolute left-[48%] top-[26%] size-[300px] animate-drift rounded-full bg-[#7cf7ff] opacity-[0.07] blur-[110px]" />
          <ViewportGrid className="opacity-60" />
          <div className="grain-live" />
        </div>
        <Viewfinder inset={14} cross={false} className="text-white/20" />

        <div className="relative flex flex-col gap-9 p-6 sm:p-10">
          <HeroSlate scene={scene} take={(stats?.today ?? 0) + 1} />

          <div className="grid gap-10 xl:grid-cols-[1fr_auto] xl:items-end">
            <div className="min-w-0">
              <p className="text-[13px] text-fg-3">
                {greet} · {u.teamName ?? "팀 미지정"}
              </p>
              <h1 className="mt-3 break-keep text-[34px] font-semibold leading-[1.08] tracking-[-0.045em] sm:text-[54px]">
                <SplitWords text={`${u.name} ${title}님,`} />
                <br />
                <SplitWords text="오늘은 어떤 장면을 찍을까요?" delay={0.18} className="text-fg-2" />
              </h1>
              <CyclingLines className="mt-5 font-serif text-[24px] italic leading-tight text-accent-2 sm:text-[30px]" lines={[...BRAND.taglines]} />
            </div>
            <HeroStats stats={{ mine: stats?.mine ?? 0, total: stats?.total ?? 0, videos: stats?.videos ?? 0, directors: stats?.directors ?? 0 }} />
          </div>

          <HeroPrompt recent={recentPrompts} />

          <div className="grid gap-3 md:grid-cols-3">
            <CamCard index={0} href="/create/image" cam="A Cam · Still" icon={<ImagePlus />} title="이미지 생성" desc="Seedream · Nano Banana · GPT Image" glow="#ff5b24" />
            <CamCard index={1} href="/create/video" cam="B Cam · Motion" icon={<Clapperboard />} title="영상 생성" desc="MiniMax H3 · Seedance 2.5 드래프트" glow="#5b4bff" />
            <CamCard index={2} href="/canvas?new=1" icon={<Workflow />} cam="C Cam · Pipeline" title="노드 캔버스" desc="프롬프트 → 이미지 → 영상을 노드로" glow="#3dd68c" />
          </div>
        </div>
      </section>

      {/* 쇼릴 */}
      <section className="flex flex-col gap-4">
        <SectionHead index="00" title="쇼릴" accent="Now showing." href="/library" />
        <Showreel frames={reel} />
      </section>

      {/* 최근 내 작업 */}
      <section className="flex flex-col gap-4">
        <SectionHead index="01" title="최근 내 작업" accent="Recent takes." href="/library?mine=1" />
        {mine.length ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {mine.map((a, i) => (
              <Reveal key={a.id} delay={Math.min(i, 9) * 0.04}>
                <Link href={`/library?asset=${a.id}`} className="group relative block aspect-[4/5] overflow-hidden rounded-2xl border border-line bg-panel-2">
                  <MediaThumb kind={a.kind} thumb={a.urls.thumb} src={a.urls.src} durationSec={a.durationSec} className="transition duration-700 group-hover:scale-[1.04]" />
                  {a.modelId && (
                    <span className="pointer-events-none absolute left-2.5 top-2 rounded bg-black/40 px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-white/85 opacity-0 backdrop-blur transition group-hover:opacity-100">
                      {getModel(a.modelId)?.name ?? a.modelId}
                    </span>
                  )}
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-3 opacity-0 transition duration-300 group-hover:opacity-100">
                    <p className="line-clamp-2 text-[11.5px] text-white/90">{a.prompt || a.filename}</p>
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-line-2 px-6 py-12 text-center">
            <p className="font-serif text-[26px] italic text-fg-2">Your first take.</p>
            <p className="mt-1 text-sm text-fg-3">아직 만든 결과물이 없어요. 위에서 이미지나 영상을 만들어 보세요.</p>
          </div>
        )}
      </section>

      <div className="grid gap-14 xl:grid-cols-[1.4fr_1fr]">
        {/* 프로젝트 */}
        <section className="flex min-w-0 flex-col gap-4">
          <SectionHead index="02" title="진행 중인 프로젝트" accent="In production." href="/projects" />
          <div className="grid gap-3 sm:grid-cols-2">
            {projectRows.map((p, i) => (
              <Reveal key={p.id} delay={i * 0.05}>
                <Link href={`/projects/${p.id}`} className="group flex items-center gap-3 rounded-2xl border border-line bg-panel p-3 transition duration-300 hover:-translate-y-0.5 hover:border-line-2 hover:bg-panel-2/60">
                  <div className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-panel-3">
                    {covers[i] ? (
                      <MediaThumb kind={covers[i]!.kind} thumb={covers[i]!.urls.thumb} src={covers[i]!.urls.src} autoPlayOnHover={false} className="transition duration-500 group-hover:scale-105" />
                    ) : (
                      <span className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${p.color ?? "#333"}66, transparent)` }} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium">{p.name}</p>
                    <p className="truncate text-[12px] text-fg-3">{p.description || (p.isPersonal ? "개인 작업공간" : "설명 없음")}</p>
                    <p className="mt-1 text-[11px] text-fg-4">
                      <TimeAgo date={p.lastActivityAt} />
                    </p>
                  </div>
                  <ArrowUpRight className="size-4 text-fg-4 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-fg" />
                </Link>
              </Reveal>
            ))}
          </div>
        </section>

        {/* 모델 */}
        <section className="flex min-w-0 flex-col gap-4">
          <SectionHead index="03" title="모델 라인업" accent="The kit." />
          <Reveal className="flex flex-col divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel">
            {MODELS.map((m) => (
              <Link key={m.id} href={`/create/${m.kind}?model=${m.id}`} className="group flex items-center gap-3 px-4 py-3 transition hover:bg-panel-2/60">
                <ModelSwatch model={{ gradient: m.gradient, vendor: m.vendor }} className="size-9 transition duration-300 group-hover:scale-110 group-hover:-rotate-3" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-[13.5px] font-medium">
                    {m.name}
                    {m.badge && <span className="rounded bg-inv px-1 font-mono text-[9px] font-bold text-inv-fg">{m.badge}</span>}
                  </p>
                  <p className="truncate text-[11.5px] text-fg-3">{m.tagline}</p>
                </div>
                <span className={cn("rounded-md px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider", m.kind === "video" ? "bg-info/12 text-info" : "bg-panel-3 text-fg-3")}>
                  {m.kind === "video" ? "Motion" : "Still"}
                </span>
              </Link>
            ))}
          </Reveal>
        </section>
      </div>

      {/* 팀 피드 */}
      <section className="flex flex-col gap-4">
        <SectionHead index="04" title="팀 피드" accent="Dailies." href="/library" />
        {team.length ? (
          <div className="columns-2 gap-3 sm:columns-3 lg:columns-4 xl:columns-6">
            {team.map((a, i) => (
              <Reveal key={a.id} delay={Math.min(i, 11) * 0.03} className="mb-3 break-inside-avoid">
                <Link href={`/library?asset=${a.id}`} className="group block overflow-hidden rounded-2xl border border-line bg-panel transition duration-300 hover:border-line-2">
                  <div className="relative overflow-hidden" style={{ aspectRatio: a.width && a.height ? `${a.width}/${a.height}` : "1" }}>
                    <MediaThumb kind={a.kind} thumb={a.urls.thumb} src={a.urls.src} durationSec={a.durationSec} className="transition duration-700 group-hover:scale-[1.04]" />
                  </div>
                  <div className="flex items-center gap-2 px-2.5 py-2">
                    <Avatar name={a.userName} size={18} />
                    <span className="truncate text-[11.5px] text-fg-3">{a.userName}</span>
                    <TimeAgo date={a.createdAt} className="ml-auto shrink-0 text-[10.5px] text-fg-4" />
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-line-2 px-6 py-12 text-center">
            <p className="font-serif text-[26px] italic text-fg-2">Dailies roll here.</p>
            <p className="mt-1 text-sm text-fg-3">팀 프로젝트에 결과물이 쌓이면 여기서 함께 봐요.</p>
          </div>
        )}
      </section>

      <Manifesto />
    </div>
  );
}

type ReelSource = { id: string; kind: "image" | "video"; prompt: string; filename: string; userName: string; urls: { thumb: string; src: string } };

/** 쇼릴: 썸네일이 있는 이미지만 (영상은 원본을 받아야 해서 제외), 모자라면 모델 슬롯으로 채움 */
function reelFrames(items: ReelSource[]): ReelFrame[] {
  const seen = new Set<string>();
  const takes: ReelFrame[] = [];
  for (const a of items) {
    if (a.kind !== "image" || !a.urls.thumb || seen.has(a.id)) continue;
    seen.add(a.id);
    takes.push({ type: "take", id: a.id, thumb: a.urls.thumb, prompt: a.prompt || a.filename, userName: a.userName });
    if (takes.length >= 16) break;
  }
  const slots: ReelFrame[] = MODELS.filter((m) => m.kind === "image" || m.kind === "video")
    .slice(0, Math.max(0, 8 - takes.length))
    .map((m) => ({ type: "slot", id: `slot-${m.id}`, gradient: m.gradient, name: m.name }));
  return [...takes, ...slots];
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** 한국 시간 기준 이번 달·오늘 시작 시각과 씬 번호(MMDD) */
function kstBounds() {
  const k = new Date(Date.now() + 9 * 3600_000);
  const y = k.getUTCFullYear();
  const m = k.getUTCMonth();
  const d = k.getUTCDate();
  return {
    monthStart: new Date(Date.UTC(y, m, 1) - 9 * 3600_000),
    dayStart: new Date(Date.UTC(y, m, d) - 9 * 3600_000),
    scene: `${pad2(m + 1)}${pad2(d)}`,
  };
}

/** 한국 시간 기준 인사말 */
function kstGreeting(): string {
  const hour = new Date(Date.now() + 9 * 3600_000).getUTCHours();
  return hour < 6 ? "늦은 밤이에요" : hour < 12 ? "좋은 아침이에요" : hour < 18 ? "좋은 오후예요" : "좋은 저녁이에요";
}
