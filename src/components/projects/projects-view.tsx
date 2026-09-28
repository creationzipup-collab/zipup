"use client";

import { Archive, FolderKanban, Globe, Lock, Plus, Search, Users } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

import { MediaThumb } from "@/components/assets/media";
import { SegmentBar } from "@/components/brand/hud";
import { PageTitle } from "@/components/brand/page-title";
import { ProjectFormDialog } from "@/components/projects/project-dialogs";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/controls";
import { EmptyState, TimeAgo } from "@/components/ui/misc";
import type { ProjectListItem } from "@/lib/services/projects";
import { type Visibility, VISIBILITY_LABEL } from "@/lib/types";
import { cn } from "@/lib/utils";

const VIS_ICON = { private: Lock, team: Users, company: Globe } as const;
const EASE = [0.2, 0.8, 0.2, 1] as const;

/** 프로젝트 목록 — 한 줄에 한 프로젝트: 표지, 이름, 컷·테이크·OK, 컷 진행, 최근 활동 */
export function ProjectsView({
  items,
  archived,
  openNew,
  canCreate,
  canChooseTeam,
  myTeamId,
  defaultVisibility,
}: {
  items: ProjectListItem[];
  archived: boolean;
  openNew: boolean;
  canCreate: boolean;
  canChooseTeam: boolean;
  myTeamId: string | null;
  defaultVisibility: Visibility;
}) {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [filter, setFilter] = React.useState<"all" | "mine" | "team" | "shared">("all");
  const [open, setOpen] = React.useState(openNew);

  const shown = items.filter((p) => {
    if (q && !`${p.name} ${p.description ?? ""} ${p.teamName ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (filter === "mine") return p.access === "owner";
    if (filter === "team") return !!myTeamId && p.teamId === myTeamId;
    if (filter === "shared") return p.visibility === "company";
    return true;
  });

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-6 sm:px-8 sm:py-8">
      <PageTitle
        label="Projects"
        title={archived ? "보관된 프로젝트" : "프로젝트"}
        subtitle="프로젝트 › 컷 › 테이크. 컷을 나누지 않고 프로젝트에 바로 쌓아도 돼요."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => router.push(archived ? "/projects" : "/projects?archived=1")}>
              <Archive /> {archived ? "활성 프로젝트" : "보관함"}
            </Button>
            {canCreate && !archived && (
              <Button variant="primary" onClick={() => setOpen(true)}>
                <Plus /> 새 프로젝트
              </Button>
            )}
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-4" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="프로젝트 검색"
            className="h-9 w-full rounded-full border border-line-2 bg-white/[0.03] pl-9 pr-3 text-sm outline-none transition focus:border-accent/60"
          />
        </div>
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "전체" },
            { value: "mine", label: "내가 관리" },
            { value: "team", label: "우리 팀" },
            { value: "shared", label: "전사 공개" },
          ]}
        />
        <span className="ml-auto font-mono text-[11px] text-fg-4">{shown.length} PROJECTS</span>
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon={<FolderKanban />}
          title="프로젝트가 없어요"
          description="프로젝트로 생성물·컷·캔버스를 묶어 팀과 같이 써요."
          action={
            canCreate && !archived ? (
              <Button variant="primary" onClick={() => setOpen(true)}>
                <Plus /> 새 프로젝트
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="flex flex-col">
          {/* 머리줄 */}
          <div className="hidden grid-cols-[120px_minmax(0,1fr)_76px_76px_76px_170px_96px] items-end gap-5 border-b border-line px-3 pb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-fg-4 lg:grid">
            <span />
            <span>Project</span>
            <span className="text-right">Cuts</span>
            <span className="text-right">Takes</span>
            <span className="text-right">OK</span>
            <span>Progress</span>
            <span className="text-right">Updated</span>
          </div>
          <ul className="flex flex-col">
            {shown.map((p, i) => {
              const Vis = VIS_ICON[p.visibility];
              const color = p.isPersonal ? "var(--fg-3)" : (p.color ?? "var(--accent)");
              return (
                <motion.li key={p.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: Math.min(i, 12) * 0.03, ease: EASE }}>
                  <Link
                    href={`/projects/${p.id}`}
                    className="group relative grid grid-cols-[88px_minmax(0,1fr)] items-center gap-4 border-b border-line px-3 py-3.5 transition-colors hover:bg-white/[0.02] lg:grid-cols-[120px_minmax(0,1fr)_76px_76px_76px_170px_96px] lg:gap-5"
                  >
                    <span aria-hidden className="absolute inset-y-2 left-0 w-px origin-center scale-y-0 bg-accent shadow-[0_0_8px_var(--accent-glow)] transition-transform duration-300 group-hover:scale-y-100" />
                    <span className="relative block aspect-video overflow-hidden rounded-md bg-panel-3 ring-1 ring-white/[0.06]">
                      {p.cover ? (
                        <MediaThumb kind={p.cover.kind} thumb={p.cover.urls.thumb} src={p.cover.urls.src} autoPlayOnHover={false} className="transition duration-500 group-hover:scale-[1.04]" />
                      ) : (
                        <span className="absolute inset-0" style={{ background: `radial-gradient(120% 120% at 15% 0%, color-mix(in oklab, ${color} 38%, transparent), transparent 62%)` }} />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="size-1.5 shrink-0 rounded-full" style={{ background: color }} />
                        <span className="truncate text-[15px] font-medium transition group-hover:text-accent">{p.name}</span>
                        <span className="hidden shrink-0 items-center gap-1 rounded-full border border-line-2 px-2 py-px text-[10.5px] text-fg-3 sm:inline-flex">
                          <Vis className="size-3" /> {p.isPersonal ? "개인" : VISIBILITY_LABEL[p.visibility]}
                        </span>
                      </span>
                      <span className="mt-1 block truncate text-[12px] text-fg-4">
                        {p.description || (p.isPersonal ? "나만 보는 개인 작업공간" : "설명 없음")}
                        {p.teamName ? ` · ${p.teamName}` : ""}
                        {` · 멤버 ${p.memberCount}`}
                      </span>
                      {/* 좁은 화면: 숫자를 한 줄로 */}
                      <span className="mt-1.5 flex items-center gap-3 font-mono text-[10.5px] text-fg-4 lg:hidden">
                        <span>{p.cuts.total} CUTS</span>
                        <span>{p.assetCount} TAKES</span>
                        <span className={p.okCount ? "text-success" : undefined}>OK {p.okCount}</span>
                        <TimeAgo date={p.lastActivityAt} className="ml-auto font-sans" />
                      </span>
                    </span>
                    <Num value={p.cuts.total} />
                    <Num value={p.assetCount} />
                    <Num value={p.okCount} tone={p.okCount ? "text-success" : undefined} />
                    <span className="hidden flex-col gap-1.5 lg:flex">
                      <SegmentBar
                        parts={[
                          { value: p.cuts.done, className: "bg-success", label: "확정" },
                          { value: p.cuts.active, className: "bg-accent shadow-[0_0_8px_var(--accent-glow)]", label: "진행" },
                          { value: Math.max(0, p.cuts.total - p.cuts.done - p.cuts.active), className: "bg-white/15", label: "대기" },
                        ]}
                      />
                      <span className="font-mono text-[10px] text-fg-4">{p.cuts.total ? `${p.cuts.done}/${p.cuts.total} 확정` : "컷 없이"}</span>
                    </span>
                    <span className="hidden text-right text-[11.5px] text-fg-4 lg:block">
                      <TimeAgo date={p.lastActivityAt} />
                    </span>
                  </Link>
                </motion.li>
              );
            })}
          </ul>
        </div>
      )}

      <ProjectFormDialog open={open} onOpenChange={setOpen} canChooseTeam={canChooseTeam} initial={{ teamId: myTeamId, visibility: defaultVisibility }} />
    </div>
  );
}

function Num({ value, tone }: { value: number; tone?: string }) {
  return <span className={cn("num hidden text-right text-[28px] lg:block", tone ?? "text-fg")}>{value.toLocaleString("ko-KR")}</span>;
}
