import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { ArrowUpRight, Clapperboard, ImagePlus, Workflow } from "lucide-react";
import Link from "next/link";

import { MediaThumb } from "@/components/assets/media";
import { ModelSwatch } from "@/components/studio/model-picker";
import { Avatar, TimeAgo } from "@/components/ui/misc";
import { db } from "@/lib/db";
import { assets, favorites, projects, user } from "@/lib/db/schema";
import { IMAGE_MODELS, MODELS, VIDEO_MODELS } from "@/lib/models/registry";
import { visibleProjectsWhere } from "@/lib/services/access";
import { assetUrls } from "@/lib/services/assets";
import { toListItems } from "@/lib/services/library";
import { requireActiveUser } from "@/lib/session";
import { cn } from "@/lib/utils";

export default async function HomePage() {
  const u = await requireActiveUser();

  const baseSelect = {
    a: assets,
    projectName: projects.name,
    userName: user.name,
    isFavorite: sql<boolean>`exists(select 1 from ${favorites} where ${favorites.userId} = ${u.id} and ${favorites.assetId} = ${assets.id})`,
  };
  const [mineRows, teamRows, projectRows] = await Promise.all([
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
  ]);
  const [mine, team] = await Promise.all([toListItems(mineRows), toListItems(teamRows)]);
  const covers = await Promise.all(
    projectRows.map(async (p) => {
      if (!p.coverAssetId) return null;
      const [a] = await db.select().from(assets).where(eq(assets.id, p.coverAssetId));
      return a ? { kind: a.kind, urls: await assetUrls(a) } : null;
    }),
  );

  const greet = kstGreeting();

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-12 px-4 py-8 sm:px-8 sm:py-10">
      {/* 히어로 */}
      <section className="relative overflow-hidden rounded-[28px] border border-line bg-panel">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -right-24 -top-40 size-[520px] rounded-full bg-accent opacity-[0.13] blur-[120px]" />
          <div className="absolute -bottom-48 left-1/4 size-[480px] rounded-full bg-[#3a2cff] opacity-[0.16] blur-[130px]" />
          <div className="dot-grid absolute inset-0 opacity-50 [mask-image:linear-gradient(to_bottom,black,transparent)]" />
        </div>
        <div className="relative flex flex-col gap-8 p-6 sm:p-10">
          <div className="flex flex-col gap-2">
            <span className="eyebrow">{greet}</span>
            <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.03em] sm:text-[40px]">
              {u.name}님, 오늘은 무엇을 만들까요?
            </h1>
            <p className="text-sm text-fg-3">
              {u.teamName ?? "팀 미지정"} · 이미지 {IMAGE_MODELS.length}종 · 영상 {VIDEO_MODELS.length}종 모델을 쓸 수 있어요
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <QuickCard href="/create/image" icon={<ImagePlus />} title="이미지 생성" desc="Seedream · Nano Banana · GPT Image" gradient="from-[#ff5b24]/25 via-transparent" />
            <QuickCard href="/create/video" icon={<Clapperboard />} title="영상 생성" desc="MiniMax H3 · Seedance 2.5 드래프트" gradient="from-[#3a2cff]/30 via-transparent" />
            <QuickCard href="/canvas?new=1" icon={<Workflow />} title="노드 캔버스" desc="프롬프트→이미지→영상을 노드로 연결" gradient="from-[#3dd68c]/20 via-transparent" />
          </div>
        </div>
      </section>

      {/* 최근 내 작업 */}
      <section className="flex flex-col gap-4">
        <SectionHead title="최근 내 작업" href="/library?mine=1" />
        {mine.length ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {mine.map((a) => (
              <Link key={a.id} href={`/library?asset=${a.id}`} className="group relative aspect-[4/5] overflow-hidden rounded-2xl border border-line bg-panel-2">
                <MediaThumb kind={a.kind} thumb={a.urls.thumb} src={a.urls.src} durationSec={a.durationSec} className="transition duration-500 group-hover:scale-[1.03]" />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 opacity-0 transition group-hover:opacity-100">
                  <p className="line-clamp-2 text-[11.5px] text-white/90">{a.prompt || a.filename}</p>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-line-2 px-6 py-10 text-center text-sm text-fg-3">
            아직 만든 결과물이 없어요. 위에서 이미지나 영상을 만들어 보세요.
          </div>
        )}
      </section>

      <div className="grid gap-12 xl:grid-cols-[1.4fr_1fr]">
        {/* 프로젝트 */}
        <section className="flex flex-col gap-4">
          <SectionHead title="진행 중인 프로젝트" href="/projects" />
          <div className="grid gap-3 sm:grid-cols-2">
            {projectRows.map((p, i) => (
              <Link key={p.id} href={`/projects/${p.id}`} className="group flex items-center gap-3 rounded-2xl border border-line bg-panel p-3 transition hover:border-line-2 hover:bg-panel-2/60">
                <div className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-panel-3">
                  {covers[i] ? (
                    <MediaThumb kind={covers[i]!.kind} thumb={covers[i]!.urls.thumb} src={covers[i]!.urls.src} autoPlayOnHover={false} />
                  ) : (
                    <span className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${p.color ?? "#333"}55, transparent)` }} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium">{p.name}</p>
                  <p className="truncate text-[12px] text-fg-3">{p.description || (p.isPersonal ? "개인 작업공간" : "설명 없음")}</p>
                  <p className="mt-1 text-[11px] text-fg-4">
                    <TimeAgo date={p.lastActivityAt} />
                  </p>
                </div>
                <ArrowUpRight className="size-4 text-fg-4 transition group-hover:text-fg" />
              </Link>
            ))}
          </div>
        </section>

        {/* 모델 */}
        <section className="flex flex-col gap-4">
          <SectionHead title="사용 가능한 모델" />
          <div className="flex flex-col divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel">
            {MODELS.map((m) => (
              <Link key={m.id} href={`/create/${m.kind}?model=${m.id}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-panel-2/60">
                <ModelSwatch model={{ gradient: m.gradient, vendor: m.vendor }} className="size-9" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-[13.5px] font-medium">
                    {m.name}
                    {m.badge && <span className="rounded bg-inv px-1 font-mono text-[9px] font-bold text-inv-fg">{m.badge}</span>}
                  </p>
                  <p className="truncate text-[11.5px] text-fg-3">{m.tagline}</p>
                </div>
                <span className={cn("rounded-md px-1.5 py-0.5 text-[10.5px]", m.kind === "video" ? "bg-info/12 text-info" : "bg-panel-3 text-fg-3")}>
                  {m.kind === "video" ? "영상" : "이미지"}
                </span>
              </Link>
            ))}
          </div>
        </section>
      </div>

      {/* 팀 피드 */}
      <section className="flex flex-col gap-4">
        <SectionHead title="팀 피드" href="/library" />
        {team.length ? (
          <div className="columns-2 gap-3 sm:columns-3 lg:columns-4 xl:columns-6">
            {team.map((a) => (
              <Link key={a.id} href={`/library?asset=${a.id}`} className="group mb-3 block break-inside-avoid overflow-hidden rounded-2xl border border-line bg-panel">
                <div className="relative" style={{ aspectRatio: a.width && a.height ? `${a.width}/${a.height}` : "1" }}>
                  <MediaThumb kind={a.kind} thumb={a.urls.thumb} src={a.urls.src} durationSec={a.durationSec} />
                </div>
                <div className="flex items-center gap-2 px-2.5 py-2">
                  <Avatar name={a.userName} size={18} />
                  <span className="truncate text-[11.5px] text-fg-3">{a.userName}</span>
                  <TimeAgo date={a.createdAt} className="ml-auto shrink-0 text-[10.5px] text-fg-4" />
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-fg-4">아직 팀에서 공유된 결과물이 없어요.</p>
        )}
      </section>
    </div>
  );
}

function SectionHead({ title, href }: { title: string; href?: string }) {
  return (
    <div className="flex items-end justify-between">
      <h2 className="text-[17px] font-semibold tracking-tight">{title}</h2>
      {href && (
        <Link href={href} className="flex items-center gap-1 text-[12.5px] text-fg-3 hover:text-fg">
          전체 보기 <ArrowUpRight className="size-3.5" />
        </Link>
      )}
    </div>
  );
}

function QuickCard({ href, icon, title, desc, gradient }: { href: string; icon: React.ReactNode; title: string; desc: string; gradient: string }) {
  return (
    <Link
      href={href}
      className="group relative flex items-center gap-4 overflow-hidden rounded-2xl border border-line-2 bg-panel-2/50 p-4 backdrop-blur transition hover:-translate-y-0.5 hover:border-line-3 hover:bg-panel-2"
    >
      <span className={cn("pointer-events-none absolute inset-0 bg-gradient-to-br opacity-70 transition group-hover:opacity-100", gradient)} />
      <span className="relative flex size-11 items-center justify-center rounded-xl bg-inv text-inv-fg [&_svg]:size-5">{icon}</span>
      <span className="relative min-w-0 flex-1">
        <span className="block text-[15px] font-semibold">{title}</span>
        <span className="block truncate text-[12px] text-fg-3">{desc}</span>
      </span>
      <ArrowUpRight className="relative size-4 text-fg-3 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-fg" />
    </Link>
  );
}

/** 한국 시간 기준 인사말 */
function kstGreeting(): string {
  const hour = new Date(Date.now() + 9 * 3600_000).getUTCHours();
  return hour < 6 ? "늦은 밤이에요" : hour < 12 ? "좋은 아침이에요" : hour < 18 ? "좋은 오후예요" : "좋은 저녁이에요";
}
