"use client";

import { Archive, FolderKanban, Globe, Image as ImageIcon, Lock, Plus, Search, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

import { MediaThumb } from "@/components/assets/media";
import { ProjectFormDialog } from "@/components/projects/project-dialogs";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/controls";
import { EmptyState, TimeAgo } from "@/components/ui/misc";
import type { ProjectListItem } from "@/lib/services/projects";
import { VISIBILITY_LABEL } from "@/lib/types";
import { cn } from "@/lib/utils";

const VIS_ICON = { private: Lock, team: Users, company: Globe } as const;

export function ProjectsView({
  items,
  archived,
  openNew,
  canCreate,
  canChooseTeam,
  myTeamId,
}: {
  items: ProjectListItem[];
  archived: boolean;
  openNew: boolean;
  canCreate: boolean;
  canChooseTeam: boolean;
  myTeamId: string | null;
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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-semibold tracking-[-0.02em]">{archived ? "보관된 프로젝트" : "프로젝트"}</h1>
          <p className="mt-1 text-sm text-fg-3">생성물·컬렉션·노드 캔버스를 프로젝트 단위로 묶어 팀과 공유해요.</p>
        </div>
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
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-4" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="프로젝트 검색"
            className="h-9 w-full rounded-[10px] border border-line-2 bg-panel/80 pl-9 pr-3 text-sm outline-none focus:border-fg-3"
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
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon={<FolderKanban />}
          title="프로젝트가 없어요"
          description="새 프로젝트를 만들어 팀과 생성물을 공유해 보세요."
          action={canCreate && !archived ? <Button variant="primary" onClick={() => setOpen(true)}><Plus /> 새 프로젝트</Button> : undefined}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {shown.map((p) => {
            const Vis = VIS_ICON[p.visibility];
            return (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-panel transition hover:-translate-y-0.5 hover:border-line-2 hover:shadow-[var(--shadow-soft)]"
              >
                <div className="relative aspect-[16/9] overflow-hidden bg-panel-2">
                  {p.cover ? (
                    <MediaThumb kind={p.cover.kind} thumb={p.cover.urls.thumb} src={p.cover.urls.src} className="transition duration-500 group-hover:scale-[1.03]" autoPlayOnHover={false} />
                  ) : (
                    <div className="absolute inset-0" style={{ background: `radial-gradient(120% 90% at 20% 10%, ${p.isPersonal ? "#777" : p.color ?? "#ff5b24"}55, transparent 60%), var(--panel-2)` }}>
                      <FolderKanban className="absolute bottom-3 right-3 size-6 text-fg-4" />
                    </div>
                  )}
                  <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-md bg-black/55 px-1.5 py-0.5 text-[10.5px] text-white backdrop-blur">
                    <Vis className="size-3" /> {p.isPersonal ? "개인" : VISIBILITY_LABEL[p.visibility]}
                  </span>
                </div>
                <div className="flex flex-1 flex-col gap-2 p-4">
                  <div className="flex items-center gap-2">
                    <span className="size-2 shrink-0 rounded-sm" style={{ background: p.isPersonal ? "var(--fg-3)" : p.color ?? "var(--accent)" }} />
                    <span className="truncate text-[15px] font-semibold">{p.name}</span>
                  </div>
                  <p className={cn("line-clamp-2 text-[12.5px] leading-relaxed", p.description ? "text-fg-3" : "text-fg-4")}>{p.description || (p.isPersonal ? "나만 보는 개인 작업공간" : "설명 없음")}</p>
                  <div className="mt-auto flex items-center gap-3 pt-2 text-[11.5px] text-fg-4">
                    <span className="inline-flex items-center gap-1"><ImageIcon className="size-3" /> {p.assetCount}</span>
                    <span className="inline-flex items-center gap-1"><Users className="size-3" /> {p.memberCount}</span>
                    {p.teamName && <span className="truncate">{p.teamName}</span>}
                    <TimeAgo date={p.lastActivityAt} className="ml-auto" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <ProjectFormDialog open={open} onOpenChange={setOpen} canChooseTeam={canChooseTeam} initial={{ teamId: myTeamId }} />
    </div>
  );
}
