"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderKanban, Hash, Layers, Plus } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Segmented, Select } from "@/components/ui/controls";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/misc";
import type { AssetListItem } from "@/lib/services/library";
import type { ProjectListItem } from "@/lib/services/projects";
import { cn, fetchJson } from "@/lib/utils";

export function useEditableProjects(enabled = true) {
  return useQuery({
    queryKey: ["projects", "list"],
    queryFn: () => fetchJson<{ items: ProjectListItem[] }>("/api/projects").then((r) => r.items),
    enabled,
    staleTime: 30_000,
  });
}

/* ---------------------------------- 태그 ---------------------------------- */

export function TagDialog({
  open,
  onOpenChange,
  onApply,
  count,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onApply: (add: string[], remove: string[]) => void;
  count: number;
}) {
  const [value, setValue] = React.useState("");
  const [mode, setMode] = React.useState<"add" | "remove">("add");
  const { data } = useQuery({
    queryKey: ["directory", ""],
    queryFn: () => fetchJson<{ tags: { name: string; count: number }[] }>("/api/directory"),
    enabled: open,
  });
  const [wasOpen, setWasOpen] = React.useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) setValue("");
  }
  const names = value.split(/[,\s]+/).map((t) => t.replace(/^#/, "").trim()).filter(Boolean);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={`태그 ${mode === "add" ? "추가" : "제거"}`} description={`${count}개 파일에 적용해요.`}>
        <DialogBody className="flex flex-col gap-4">
          <Segmented value={mode} onChange={setMode} options={[{ value: "add", label: "추가" }, { value: "remove", label: "제거" }]} />
          <Input autoFocus value={value} onChange={(e) => setValue(e.target.value)} placeholder="예: 인물, 1차셀렉, 클라이언트확정" onKeyDown={(e) => {
            if (e.key === "Enter" && names.length) {
              onApply(mode === "add" ? names : [], mode === "remove" ? names : []);
              onOpenChange(false);
            }
          }} />
          {!!data?.tags.length && (
            <div className="flex flex-wrap gap-1.5">
              {data.tags.map((t) => (
                <button
                  key={t.name}
                  type="button"
                  onClick={() => setValue((v) => (v ? `${v}, ${t.name}` : t.name))}
                  className="inline-flex h-6 items-center gap-1 rounded-md bg-panel-3 px-2 text-[12px] text-fg-2 hover:text-fg"
                >
                  <Hash className="size-3 text-fg-4" />
                  {t.name}
                  <span className="text-fg-4">{t.count}</span>
                </button>
              ))}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button
            variant="primary"
            disabled={!names.length}
            onClick={() => {
              onApply(mode === "add" ? names : [], mode === "remove" ? names : []);
              onOpenChange(false);
            }}
          >
            적용
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------ 프로젝트 이동 ------------------------------ */

export function MoveDialog({
  open,
  onOpenChange,
  onMove,
  count,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onMove: (projectId: string) => void;
  count: number;
}) {
  const { data = [] } = useEditableProjects(open);
  const editable = data.filter((p) => p.access === "owner" || p.access === "editor");
  const [target, setTarget] = React.useState<string>("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="프로젝트로 이동" description={`${count}개 파일을 옮겨요.`}>
        <DialogBody className="flex max-h-[50vh] flex-col gap-1 overflow-y-auto">
          {editable.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setTarget(p.id)}
              className={cn(
                "flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition",
                target === p.id ? "border-fg bg-panel-2" : "border-transparent hover:bg-panel-2",
              )}
            >
              <span className="size-2.5 rounded-sm" style={{ background: p.isPersonal ? "var(--fg-3)" : p.color ?? "var(--accent)" }} />
              <span className="flex-1 truncate text-[13.5px]">{p.name}</span>
              <span className="text-[11px] text-fg-4">{p.assetCount}개</span>
            </button>
          ))}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button
            variant="primary"
            disabled={!target}
            onClick={() => {
              onMove(target);
              onOpenChange(false);
            }}
          >
            <FolderKanban /> 이동
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------- 컬렉션 -------------------------------- */

type CollectionRow = { id: string; name: string; projectId: string; projectName: string; count: number };

export function CollectionDialog({
  open,
  onOpenChange,
  assetIds,
  defaultProjectId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  assetIds: string[];
  defaultProjectId?: string;
}) {
  const qc = useQueryClient();
  const { data: projects = [] } = useEditableProjects(open);
  const { data: cols = [] } = useQuery({
    queryKey: ["collections"],
    queryFn: () => fetchJson<{ items: CollectionRow[] }>("/api/collections").then((r) => r.items),
    enabled: open,
  });
  const [name, setName] = React.useState("");
  const [pickedProjectId, setProjectId] = React.useState<string>("");
  const editable = projects.filter((p) => p.access === "owner" || p.access === "editor");
  // 고르지 않았으면 기본 프로젝트 → 첫 공유 프로젝트 → 개인 작업공간 순
  const projectId = pickedProjectId || defaultProjectId || editable.find((p) => !p.isPersonal)?.id || editable[0]?.id || "";

  async function addTo(id: string) {
    try {
      await fetchJson(`/api/collections/${id}`, { method: "PATCH", body: JSON.stringify({ add: assetIds }) });
      toast.success("컬렉션에 추가했어요.");
      void qc.invalidateQueries({ queryKey: ["collections"] });
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  async function create() {
    try {
      await fetchJson(`/api/collections`, { method: "POST", body: JSON.stringify({ projectId, name, assetIds }) });
      toast.success(`'${name}' 컬렉션을 만들었어요.`);
      void qc.invalidateQueries({ queryKey: ["collections"] });
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="컬렉션에 추가" description="셀렉한 컷을 모아두고 팀과 공유하세요.">
        <DialogBody className="flex flex-col gap-4">
          <div className="flex max-h-[34vh] flex-col gap-1 overflow-y-auto">
            {cols.length === 0 && <EmptyState icon={<Layers />} title="아직 컬렉션이 없어요" className="py-6" />}
            {cols.map((c) => (
              <button key={c.id} type="button" onClick={() => addTo(c.id)} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-panel-2">
                <Layers className="size-4 text-fg-3" />
                <span className="flex-1 truncate text-[13.5px]">{c.name}</span>
                <span className="truncate text-[11px] text-fg-4">
                  {c.projectName} · {c.count}개
                </span>
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-3 rounded-xl border border-line p-3">
            <span className="text-[12.5px] font-medium text-fg-2">새 컬렉션</span>
            <Field label="이름">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 1차 셀렉, 클라이언트 공유" />
            </Field>
            <Field label="프로젝트">
              <Select value={projectId} onValueChange={setProjectId} options={editable.map((p) => ({ value: p.id, label: p.name }))} />
            </Field>
            <Button variant="primary" disabled={!name.trim() || !projectId} onClick={create} className="self-end">
              <Plus /> 만들고 추가
            </Button>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------------------------- 비교 ---------------------------------- */

export function CompareDialog({ open, onOpenChange, items }: { open: boolean; onOpenChange: (v: boolean) => void; items: AssetListItem[] }) {
  const [mode, setMode] = React.useState<"side" | "slider">("side");
  const [pos, setPos] = React.useState(50);
  const canSlide = items.length === 2 && items.every((i) => i.kind === "image");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="full" title={`${items.length}개 비교`} className="h-[92vh]">
        <div className="flex h-full flex-col">
          {canSlide && (
            <div className="flex justify-center border-b border-line py-2">
              <Segmented value={mode} onChange={setMode} options={[{ value: "side", label: "나란히" }, { value: "slider", label: "슬라이더" }]} />
            </div>
          )}
          {mode === "slider" && canSlide ? (
            <div className="relative m-4 flex-1 select-none overflow-hidden rounded-xl bg-black" onMouseMove={(e) => {
              if (e.buttons !== 1) return;
              const r = e.currentTarget.getBoundingClientRect();
              setPos(Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)));
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={items[1].urls.src} alt="" className="absolute inset-0 size-full object-contain" />
              <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={items[0].urls.src} alt="" className="absolute inset-0 size-full object-contain" />
              </div>
              <div className="absolute inset-y-0 w-0.5 bg-white shadow-[0_0_12px_rgba(0,0,0,0.6)]" style={{ left: `${pos}%` }} />
              <input type="range" min={0} max={100} value={pos} onChange={(e) => setPos(Number(e.target.value))} className="absolute inset-x-8 bottom-4 accent-white" />
            </div>
          ) : (
            <div className={cn("grid flex-1 gap-3 p-4", items.length <= 2 ? "grid-cols-2" : items.length === 3 ? "grid-cols-3" : "grid-cols-2 grid-rows-2")}>
              {items.map((a) => (
                <div key={a.id} className="flex min-h-0 flex-col gap-2">
                  <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl bg-black">
                    {a.kind === "video" ? (
                      <video src={a.urls.src} controls loop muted autoPlay className="size-full object-contain" />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.urls.src} alt="" className="size-full object-contain" />
                    )}
                  </div>
                  <p className="truncate text-[12px] text-fg-3">{a.filename}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

