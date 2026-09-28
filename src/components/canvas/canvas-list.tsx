"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, LayoutTemplate, Plus, Workflow } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/controls";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { EmptyState, TimeAgo } from "@/components/ui/misc";
import type { EditableProject } from "@/lib/services/studio";
import { cn, fetchJson } from "@/lib/utils";

type Row = { id: string; name: string; projectId: string; projectName: string; updatedAt: string; createdBy: string; nodeCount: number };

const TEMPLATES = [
  { id: "image-to-video", title: "이미지 → 영상", desc: "프롬프트로 이미지를 만들고 고른 컷을 영상으로" },
  { id: "character-sheet", title: "캐릭터 시트", desc: "레퍼런스로 같은 캐릭터를 여러 각도로" },
  { id: "blank", title: "빈 캔버스", desc: "처음부터 직접 구성" },
] as const;

export function CanvasList({ projects, openNew, canCreate }: { projects: EditableProject[]; openNew: boolean; canCreate: boolean }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(openNew && canCreate);
  const [name, setName] = React.useState("새 캔버스");
  const [projectId, setProjectId] = React.useState(projects[0]?.id ?? "");
  const [template, setTemplate] = React.useState<(typeof TEMPLATES)[number]["id"]>("image-to-video");
  const [loading, setLoading] = React.useState(false);
  const { data = [], isLoading } = useQuery({
    queryKey: ["canvases"],
    queryFn: () => fetchJson<{ items: Row[] }>("/api/canvases").then((r) => r.items),
  });

  async function create() {
    setLoading(true);
    try {
      const res = await fetchJson<{ item: { id: string } }>("/api/canvases", { method: "POST", body: JSON.stringify({ name, projectId, template }) });
      router.push(`/canvas/${res.item.id}`);
    } catch (e) {
      toast.error((e as Error).message);
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-4 py-6 sm:px-8 sm:py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-semibold tracking-[-0.02em]">노드 캔버스</h1>
          <p className="mt-1 text-sm text-fg-3">프롬프트 → 이미지 → 영상 과정을 노드로 연결해 반복 가능한 워크플로를 만들어요.</p>
        </div>
        {canCreate && (
          <Button variant="primary" onClick={() => setOpen(true)}>
            <Plus /> 새 캔버스
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-36 rounded-2xl" />)}</div>
      ) : data.length === 0 ? (
        <EmptyState icon={<Workflow />} title="아직 캔버스가 없어요" description="템플릿으로 시작하면 금방 익숙해져요." action={canCreate ? <Button variant="primary" onClick={() => setOpen(true)}><Plus /> 새 캔버스</Button> : undefined} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((c) => (
            <Link key={c.id} href={`/canvas/${c.id}`} className="dot-grid group flex min-h-36 flex-col justify-between rounded-2xl border border-line bg-panel p-4 transition hover:border-line-2 hover:bg-panel-2/60">
              <div className="flex items-center justify-between">
                <Workflow className="size-5 text-fg-3" />
                <ArrowRight className="size-4 text-fg-4 transition group-hover:translate-x-0.5 group-hover:text-fg" />
              </div>
              <div>
                <p className="text-[15px] font-semibold">{c.name}</p>
                <p className="mt-0.5 text-[12px] text-fg-4">
                  {c.projectName} · 노드 {c.nodeCount}개 · <TimeAgo date={c.updatedAt} />
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="lg" title="새 노드 캔버스">
          <DialogBody className="flex flex-col gap-4">
            <div className="grid gap-2 sm:grid-cols-3">
              {TEMPLATES.map((t) => (
                <button key={t.id} type="button" onClick={() => setTemplate(t.id)} className={cn("flex flex-col gap-1.5 rounded-xl border p-3 text-left transition", template === t.id ? "border-fg bg-panel-2" : "border-line-2 hover:border-line-3")}>
                  <LayoutTemplate className="size-4 text-fg-3" />
                  <span className="text-[13px] font-semibold">{t.title}</span>
                  <span className="text-[11.5px] leading-snug text-fg-3">{t.desc}</span>
                </button>
              ))}
            </div>
            <Field label="이름">
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
            </Field>
            <Field label="프로젝트" hint="캔버스에서 만든 결과물은 이 프로젝트에 저장돼요.">
              <Select value={projectId} onValueChange={setProjectId} options={projects.map((p) => ({ value: p.id, label: p.isPersonal ? `🔒 ${p.name}` : p.name }))} />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>취소</Button>
            <Button variant="primary" loading={loading} disabled={!name.trim() || !projectId} onClick={create}>만들기</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
