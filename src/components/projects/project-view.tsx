"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArrowLeft,
  Clapperboard,
  Globe,
  ImagePlus,
  Layers,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  Upload,
  UserPlus,
  Users,
  Workflow,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { AssetBrowser } from "@/components/assets/asset-browser";
import { MediaThumb } from "@/components/assets/media";
import { CutBoardView } from "@/components/cuts/cut-board";
import { MembersDialog, ProjectFormDialog } from "@/components/projects/project-dialogs";
import { useUploader } from "@/components/studio/reference-slots";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/controls";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { EmptyState, TimeAgo } from "@/components/ui/misc";
import { ACCEPT_UPLOADS } from "@/lib/uploads";
import type { AccessLevel } from "@/lib/services/access";
import { VISIBILITY_LABEL, type Visibility } from "@/lib/types";
import { fetchJson } from "@/lib/utils";

type Overview = {
  project: {
    id: string;
    name: string;
    description: string | null;
    color: string | null;
    visibility: Visibility;
    isPersonal: boolean;
    teamId: string | null;
    ownerId: string;
    archivedAt: string | null;
    lastActivityAt: string;
  };
  level: AccessLevel;
  teamName: string | null;
  ownerName: string;
  stats: { total: number; images: number; videos: number; picks: number };
  cutCount: number;
  collections: { id: string; name: string; description: string | null; updatedAt: string; count: number }[];
  canvases: { id: string; name: string; updatedAt: string }[];
};

const VIS_ICON = { private: Lock, team: Users, company: Globe } as const;

export function ProjectView({
  data,
  cover,
  initialTab,
  initialCollection,
  initialCut,
  canChooseTeam,
}: {
  data: Overview;
  cover: { kind: "image" | "video"; urls: { thumb: string; src: string; download: string } } | null;
  initialTab: string;
  initialCollection: string | null;
  initialCut: string | null;
  canChooseTeam: boolean;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const p = data.project;
  const canEdit = data.level === "owner" || data.level === "editor";
  const canManage = data.level === "owner";
  const [tab, setTab] = React.useState(initialTab);
  const [collection, setCollection] = React.useState<string | null>(initialCollection);
  const [cut, setCut] = React.useState<string | null>(initialCut);
  // 컷을 열고 닫을 때 주소에도 남겨서 공유·뒤로 가기가 되게
  function openCut(id: string | null) {
    setCut(id);
    const params = new URLSearchParams(window.location.search);
    params.set("tab", "cuts");
    if (id) params.set("cut", id);
    else params.delete("cut");
    window.history.replaceState(null, "", `?${params}`);
  }
  const [editOpen, setEditOpen] = React.useState(false);
  const [membersOpen, setMembersOpen] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const { upload, uploading } = useUploader(p.id);
  const Vis = VIS_ICON[p.visibility];

  async function newCanvas() {
    try {
      const res = await fetchJson<{ item: { id: string } }>("/api/canvases", { method: "POST", body: JSON.stringify({ projectId: p.id, name: "새 캔버스" }) });
      router.push(`/canvas/${res.item.id}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function newCollection() {
    const name = prompt("컬렉션 이름", "1차 셀렉");
    if (!name) return;
    try {
      await fetchJson("/api/collections", { method: "POST", body: JSON.stringify({ projectId: p.id, name }) });
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="flex flex-col">
      {/* 배너 */}
      <section className="relative overflow-hidden border-b border-line">
        <div aria-hidden className="absolute inset-0">
          {cover ? (
            <div className="absolute inset-0 scale-110 opacity-40 blur-3xl">
              <MediaThumb kind={cover.kind} thumb={cover.urls.thumb} src={cover.urls.src} autoPlayOnHover={false} />
            </div>
          ) : (
            <div className="absolute inset-0" style={{ background: `radial-gradient(80% 120% at 10% 0%, ${p.isPersonal ? "#666" : p.color ?? "#ff5b24"}40, transparent 60%)` }} />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-bg/30 via-bg/70 to-bg" />
        </div>
        <div className="relative mx-auto flex w-full max-w-[1800px] flex-col gap-5 px-4 pb-6 pt-6 sm:px-8">
          <Link href="/projects" className="flex w-fit items-center gap-1.5 text-[12.5px] text-fg-3 hover:text-fg">
            <ArrowLeft className="size-3.5" /> 프로젝트
          </Link>
          <div className="flex flex-wrap items-end gap-5">
            <div className="relative size-20 shrink-0 overflow-hidden rounded-2xl border border-line-2 bg-panel-2 shadow-[var(--shadow-soft)]">
              {cover ? (
                <MediaThumb kind={cover.kind} thumb={cover.urls.thumb} src={cover.urls.src} autoPlayOnHover={false} />
              ) : (
                <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${p.color ?? "#ff5b24"}, transparent)` }} />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-[28px] font-semibold tracking-[-0.03em]">{p.name}</h1>
                <span className="inline-flex items-center gap-1 rounded-md border border-line-2 bg-panel/60 px-2 py-0.5 text-[11.5px] text-fg-2">
                  <Vis className="size-3" /> {p.isPersonal ? "개인 작업공간" : VISIBILITY_LABEL[p.visibility]}
                </span>
                {data.teamName && <span className="rounded-md bg-panel-3 px-2 py-0.5 text-[11.5px] text-fg-3">{data.teamName}</span>}
                {p.archivedAt && <span className="rounded-md bg-warning/15 px-2 py-0.5 text-[11.5px] text-warning">보관됨</span>}
              </div>
              <p className="mt-1.5 max-w-2xl text-[13.5px] text-fg-3">{p.description || `${data.ownerName}님의 프로젝트`}</p>
              <div className="mt-3 flex flex-wrap gap-4 font-mono text-[12px] text-fg-3">
                <span>전체 {data.stats.total}</span>
                <span>이미지 {data.stats.images}</span>
                <span>영상 {data.stats.videos}</span>
                <span className="text-success">OK {data.stats.picks}</span>
                <span className="font-sans">
                  최근 활동 <TimeAgo date={p.lastActivityAt} />
                </span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canEdit && (
                <>
                  <Button variant="primary" onClick={() => router.push(`/create/image?project=${p.id}`)}>
                    <ImagePlus /> 이미지 생성
                  </Button>
                  <Button variant="secondary" onClick={() => router.push(`/create/video?project=${p.id}`)}>
                    <Clapperboard /> 영상
                  </Button>
                  <Button variant="secondary" size="icon" onClick={() => fileRef.current?.click()} aria-label="업로드" title="파일 업로드">
                    <Upload />
                  </Button>
                </>
              )}
              {!p.isPersonal && (
                <Button variant="secondary" onClick={() => setMembersOpen(true)}>
                  <UserPlus /> 공유
                </Button>
              )}
              {canManage && (
                <Menu>
                  <MenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label="더보기">
                      <MoreHorizontal />
                    </Button>
                  </MenuTrigger>
                  <MenuContent align="end">
                    <MenuItem onSelect={() => setEditOpen(true)}>
                      <Pencil /> 이름·설명·공개 범위
                    </MenuItem>
                    {!p.isPersonal && (
                      <MenuItem
                        onSelect={async () => {
                          await fetchJson(`/api/projects/${p.id}`, { method: "PATCH", body: JSON.stringify({ archived: !p.archivedAt }) });
                          toast(p.archivedAt ? "보관을 해제했어요." : "보관했어요.");
                          router.refresh();
                        }}
                      >
                        <Archive /> {p.archivedAt ? "보관 해제" : "보관하기"}
                      </MenuItem>
                    )}
                    {!p.isPersonal && (
                      <>
                        <MenuSeparator />
                        <MenuItem
                          danger
                          onSelect={async () => {
                            if (!confirm("프로젝트를 삭제할까요? 되돌릴 수 없어요.")) return;
                            try {
                              await fetchJson(`/api/projects/${p.id}`, { method: "DELETE" });
                              router.push("/projects");
                              router.refresh();
                            } catch (e) {
                              toast.error((e as Error).message);
                            }
                          }}
                        >
                          <Trash2 /> 삭제
                        </MenuItem>
                      </>
                    )}
                  </MenuContent>
                </Menu>
              )}
            </div>
          </div>
        </div>
      </section>

      <input
        ref={fileRef}
        type="file"
        multiple
        hidden
        accept={ACCEPT_UPLOADS}
        onChange={async (e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (!files.length) return;
          const done = await upload(files);
          if (done.length) {
            toast.success(`${done.length}개 파일을 올렸어요.`);
            void qc.invalidateQueries({ queryKey: ["assets"] });
          }
        }}
      />
      {uploading.length > 0 && (
        <div className="fixed bottom-5 right-5 z-40 rounded-xl border border-line-2 bg-elevated px-4 py-3 text-sm shadow-[var(--shadow-pop)]">
          업로드 중… {uploading.length}개
        </div>
      )}

      <div className="mx-auto w-full max-w-[1800px] px-4 py-5 sm:px-8">
        <Tabs value={tab} onValueChange={(t) => { setTab(t); setCollection(null); }}>
          <TabsList className="mb-5">
            <TabsTrigger value="cuts"><Clapperboard /> 컷 <span className="font-mono text-[11px] text-fg-4">{data.cutCount}</span></TabsTrigger>
            <TabsTrigger value="assets"><ImagePlus /> 클립 전체</TabsTrigger>
            <TabsTrigger value="collections"><Layers /> 컬렉션 <span className="font-mono text-[11px] text-fg-4">{data.collections.length}</span></TabsTrigger>
            <TabsTrigger value="canvases"><Workflow /> 캔버스 <span className="font-mono text-[11px] text-fg-4">{data.canvases.length}</span></TabsTrigger>
          </TabsList>

          <TabsContent value="cuts">
            <CutBoardView projectId={p.id} projectName={p.name} canEdit={canEdit} openCut={cut} onOpenCut={openCut} />
          </TabsContent>

          <TabsContent value="assets">
            <AssetBrowser projectId={p.id} canEdit={canEdit} hideScope />
          </TabsContent>

          <TabsContent value="collections">
            {collection ? (
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setCollection(null)}>
                    <ArrowLeft /> 컬렉션 목록
                  </Button>
                  <span className="text-[15px] font-semibold">{data.collections.find((c) => c.id === collection)?.name}</span>
                </div>
                <AssetBrowser collectionId={collection} canEdit={canEdit} hideScope />
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {canEdit && (
                  <button onClick={newCollection} className="flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line-3 text-fg-3 transition hover:border-fg-3 hover:text-fg">
                    <Plus className="size-5" /> 새 컬렉션
                  </button>
                )}
                {data.collections.map((c) => (
                  <button key={c.id} onClick={() => setCollection(c.id)} className="flex min-h-[120px] flex-col justify-between rounded-2xl border border-line bg-panel p-4 text-left transition hover:border-line-2 hover:bg-panel-2/60">
                    <Layers className="size-5 text-fg-3" />
                    <span>
                      <span className="block text-[14px] font-semibold">{c.name}</span>
                      <span className="text-[12px] text-fg-4">
                        {c.count}개 · <TimeAgo date={c.updatedAt} />
                      </span>
                    </span>
                  </button>
                ))}
                {!canEdit && !data.collections.length && <EmptyState icon={<Layers />} title="컬렉션이 없어요" className="col-span-full" />}
              </div>
            )}
          </TabsContent>

          <TabsContent value="canvases">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {canEdit && (
                <button onClick={newCanvas} className="flex min-h-[140px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line-3 text-fg-3 transition hover:border-fg-3 hover:text-fg">
                  <Plus className="size-5" /> 새 노드 캔버스
                </button>
              )}
              {data.canvases.map((c) => (
                <Link key={c.id} href={`/canvas/${c.id}`} className="dot-grid flex min-h-[140px] flex-col justify-between rounded-2xl border border-line bg-panel p-4 transition hover:border-line-2">
                  <Workflow className="size-5 text-fg-3" />
                  <span>
                    <span className="block text-[14px] font-semibold">{c.name}</span>
                    <span className="text-[12px] text-fg-4">
                      <TimeAgo date={c.updatedAt} /> 수정
                    </span>
                  </span>
                </Link>
              ))}
              {!canEdit && !data.canvases.length && <EmptyState icon={<Workflow />} title="캔버스가 없어요" className="col-span-full" />}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <ProjectFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        projectId={p.id}
        canChooseTeam={canChooseTeam}
        initial={{ name: p.name, description: p.description ?? "", visibility: p.visibility, color: p.color ?? undefined, teamId: p.teamId }}
      />
      <MembersDialog open={membersOpen} onOpenChange={setMembersOpen} projectId={p.id} ownerId={p.ownerId} canManage={canManage} />
    </div>
  );
}
