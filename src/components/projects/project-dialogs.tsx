"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Globe, Lock, Search, UserPlus, Users, X } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/controls";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Avatar } from "@/components/ui/misc";
import type { ProjectRole, Visibility } from "@/lib/types";
import { cn, fetchJson } from "@/lib/utils";

export const PROJECT_COLORS = ["#FF5B24", "#4C8DFF", "#A974FF", "#FF7CD9", "#3DD68C", "#F5C542", "#7CF7FF", "#E5E5E5"];

const VIS: { value: Visibility; label: string; desc: string; icon: React.ElementType }[] = [
  { value: "private", label: "비공개", desc: "초대한 멤버만", icon: Lock },
  { value: "team", label: "팀 공개", desc: "같은 팀은 편집 가능", icon: Users },
  { value: "company", label: "전사 공개", desc: "모든 구성원이 볼 수 있음", icon: Globe },
];

type Directory = {
  people: { id: string; name: string; email: string; image: string | null; teamName: string | null }[];
  teams: { id: string; name: string; color: string }[];
};

export function useDirectory(q = "", enabled = true) {
  return useQuery({
    queryKey: ["directory", q],
    queryFn: () => fetchJson<Directory & { tags: { name: string; count: number }[] }>(`/api/directory?q=${encodeURIComponent(q)}`),
    enabled,
    staleTime: 30_000,
  });
}

export function VisibilityPicker({ value, onChange }: { value: Visibility; onChange: (v: Visibility) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {VIS.map((v) => {
        const Icon = v.icon;
        const active = v.value === value;
        return (
          <button
            key={v.value}
            type="button"
            onClick={() => onChange(v.value)}
            className={cn(
              "flex flex-col items-start gap-1.5 rounded-xl border p-3 text-left transition",
              active ? "border-fg bg-panel-2" : "border-line-2 hover:border-line-3",
            )}
          >
            <Icon className="size-4 text-fg-2" />
            <span className="text-[13px] font-medium">{v.label}</span>
            <span className="text-[11px] leading-snug text-fg-3">{v.desc}</span>
          </button>
        );
      })}
    </div>
  );
}

export type ProjectFormValue = {
  name: string;
  description: string;
  visibility: Visibility;
  color: string;
  teamId: string | null;
};

export function ProjectFormDialog({
  open,
  onOpenChange,
  initial,
  projectId,
  canChooseTeam,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: Partial<ProjectFormValue>;
  projectId?: string;
  canChooseTeam?: boolean;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: dir } = useDirectory("", open);
  const [v, setV] = React.useState<ProjectFormValue>({
    name: "",
    description: "",
    visibility: "team",
    color: PROJECT_COLORS[0],
    teamId: null,
    ...initial,
  });
  const [members, setMembers] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(false);
  React.useEffect(() => {
    if (open) {
      setV({ name: "", description: "", visibility: "team", color: PROJECT_COLORS[Math.floor(Math.random() * 6)], teamId: null, ...initial });
      setMembers([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function submit() {
    setLoading(true);
    try {
      if (projectId) {
        await fetchJson(`/api/projects/${projectId}`, { method: "PATCH", body: JSON.stringify(v) });
        toast.success("프로젝트를 수정했어요.");
        router.refresh();
      } else {
        const res = await fetchJson<{ item: { id: string } }>("/api/projects", {
          method: "POST",
          body: JSON.stringify({ ...v, teamId: v.teamId ?? undefined, memberIds: members }),
        });
        toast.success("프로젝트를 만들었어요.");
        router.push(`/projects/${res.item.id}`);
        router.refresh();
      }
      void qc.invalidateQueries({ queryKey: ["projects"] });
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" title={projectId ? "프로젝트 설정" : "새 프로젝트"} description="프로젝트는 생성물·컬렉션·캔버스를 묶어 팀과 공유하는 공간이에요.">
        <DialogBody className="flex flex-col gap-5">
          <div className="flex items-end gap-3">
            <Field label="이름" className="flex-1">
              <Input autoFocus value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="예: 2026 F/W 캠페인" maxLength={80} />
            </Field>
            <div className="flex gap-1.5 pb-2">
              {PROJECT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setV({ ...v, color: c })}
                  className={cn("size-6 rounded-full transition", v.color === c && "ring-2 ring-fg ring-offset-2 ring-offset-elevated")}
                  style={{ background: c }}
                  aria-label={c}
                />
              ))}
            </div>
          </div>
          <Field label="설명 (선택)">
            <Textarea value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} rows={2} className="min-h-0" placeholder="목표, 레퍼런스, 납기 등을 적어두세요." />
          </Field>
          <Field label="공개 범위">
            <VisibilityPicker value={v.visibility} onChange={(vis) => setV({ ...v, visibility: vis })} />
          </Field>
          {canChooseTeam && dir && (
            <Field label="소속 팀">
              <Select
                value={v.teamId ?? "none"}
                onValueChange={(t) => setV({ ...v, teamId: t === "none" ? null : t })}
                options={[{ value: "none", label: "팀 없음" }, ...dir.teams.map((t) => ({ value: t.id, label: t.name }))]}
              />
            </Field>
          )}
          {!projectId && (
            <Field label="멤버 초대 (선택)" hint="초대한 멤버는 공개 범위와 관계없이 편집할 수 있어요.">
              <PeoplePicker value={members} onChange={setMembers} />
            </Field>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button variant="primary" loading={loading} disabled={!v.name.trim()} onClick={submit}>
            {projectId ? "저장" : "만들기"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PeoplePicker({ value, onChange, exclude = [] }: { value: string[]; onChange: (v: string[]) => void; exclude?: string[] }) {
  const [q, setQ] = React.useState("");
  const { data } = useDirectory(q);
  const people = (data?.people ?? []).filter((p) => !exclude.includes(p.id));
  const selected = (data?.people ?? []).filter((p) => value.includes(p.id));
  return (
    <div className="flex flex-col gap-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((p) => (
            <span key={p.id} className="inline-flex h-7 items-center gap-1.5 rounded-full bg-panel-3 pl-1 pr-2 text-[12px]">
              <Avatar name={p.name} image={p.image} size={20} />
              {p.name}
              <button type="button" onClick={() => onChange(value.filter((x) => x !== p.id))} className="text-fg-4 hover:text-fg">
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-4" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름이나 이메일로 찾기" className="pl-9" />
      </div>
      <div className="flex max-h-44 flex-col overflow-y-auto rounded-xl border border-line scrollbar-thin">
        {people.map((p) => {
          const on = value.includes(p.id);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onChange(on ? value.filter((x) => x !== p.id) : [...value, p.id])}
              className="flex items-center gap-2.5 px-3 py-2 text-left transition hover:bg-panel-2"
            >
              <Avatar name={p.name} image={p.image} size={24} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px]">{p.name}</span>
                <span className="block truncate text-[11px] text-fg-4">
                  {p.email} {p.teamName ? `· ${p.teamName}` : ""}
                </span>
              </span>
              {on && <Check className="size-4" />}
            </button>
          );
        })}
        {!people.length && <p className="px-3 py-4 text-center text-xs text-fg-4">결과가 없어요</p>}
      </div>
    </div>
  );
}

type Member = { userId: string; role: ProjectRole; name: string; email: string; image: string | null };

export function MembersDialog({
  open,
  onOpenChange,
  projectId,
  ownerId,
  canManage,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  ownerId: string;
  canManage: boolean;
}) {
  const qc = useQueryClient();
  const [adding, setAdding] = React.useState<string[]>([]);
  const { data: members = [] } = useQuery({
    queryKey: ["members", projectId],
    queryFn: () => fetchJson<{ items: Member[] }>(`/api/projects/${projectId}/members`).then((r) => r.items),
    enabled: open,
  });
  async function invite() {
    try {
      await fetchJson(`/api/projects/${projectId}/members`, { method: "POST", body: JSON.stringify({ userIds: adding, role: "editor" }) });
      setAdding([]);
      toast.success("멤버를 초대했어요.");
      void qc.invalidateQueries({ queryKey: ["members", projectId] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  async function setRole(userId: string, role: ProjectRole | null) {
    try {
      await fetchJson(`/api/projects/${projectId}/members`, { method: "PATCH", body: JSON.stringify({ userId, role }) });
      void qc.invalidateQueries({ queryKey: ["members", projectId] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" title="멤버 · 공유" description="초대한 멤버는 공개 범위와 관계없이 이 프로젝트에 접근할 수 있어요.">
        <DialogBody className="flex flex-col gap-5">
          {canManage && (
            <div className="flex flex-col gap-2">
              <PeoplePicker value={adding} onChange={setAdding} exclude={members.map((m) => m.userId)} />
              <Button variant="primary" disabled={!adding.length} onClick={invite} className="self-end">
                <UserPlus /> {adding.length ? `${adding.length}명 초대` : "초대"}
              </Button>
            </div>
          )}
          <div className="flex flex-col divide-y divide-line rounded-xl border border-line">
            {members.map((m) => (
              <div key={m.userId} className="flex items-center gap-3 px-3 py-2.5">
                <Avatar name={m.name} image={m.image} size={28} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{m.name}</span>
                  <span className="block truncate text-[11px] text-fg-4">{m.email}</span>
                </span>
                {m.userId === ownerId ? (
                  <span className="text-[12px] text-fg-3">소유자</span>
                ) : canManage ? (
                  <Select
                    size="sm"
                    value={m.role}
                    onValueChange={(r) => (r === "remove" ? setRole(m.userId, null) : setRole(m.userId, r as ProjectRole))}
                    options={[
                      { value: "owner", label: "관리" },
                      { value: "editor", label: "편집" },
                      { value: "viewer", label: "보기" },
                      { value: "remove", label: "내보내기" },
                    ]}
                    className="w-[108px]"
                  />
                ) : (
                  <span className="text-[12px] text-fg-3">{m.role === "owner" ? "관리" : m.role === "editor" ? "편집" : "보기"}</span>
                )}
              </div>
            ))}
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
