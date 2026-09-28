"use client";

import { Pencil, Plus, Trash2, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Tip } from "@/components/ui/menu";
import { Progress } from "@/components/ui/misc";
import type { TeamAdminRow } from "@/lib/services/admin";
import { cn, fetchJson, usd } from "@/lib/utils";

const SWATCHES = ["#FF5B24", "#FF8A3D", "#F5C542", "#3DD68C", "#2EC5CE", "#4C8DFF", "#6F6BFF", "#A974FF", "#FF7CD9", "#9CA3AF"];

type Draft = { id?: string; name: string; color: string; description: string; budget: string };

export function TeamsAdmin({ teams, warnPercent }: { teams: TeamAdminRow[]; warnPercent: number }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [confirm, confirmDialog] = useConfirm();

  const totalCap = teams.reduce((s, t) => s + (t.monthlyBudgetMicros ?? 0), 0);
  const totalSpend = teams.reduce((s, t) => s + t.monthSpend, 0);
  const uncapped = teams.filter((t) => t.monthlyBudgetMicros == null).length;

  async function remove(t: TeamAdminRow) {
    if (!(await confirm({ title: `${t.name}을(를) 삭제할까요?`, description: "팀 프로젝트는 남지만 팀 연결이 해제돼요.", confirmLabel: "삭제", danger: true }))) return;
    try {
      await fetchJson(`/api/admin/teams/${t.id}`, { method: "DELETE" });
      toast.success("팀을 삭제했어요.");
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap gap-x-8 gap-y-2">
          <Metric label="이번 달 전체 사용" value={usd(totalSpend)} />
          <Metric label="팀 한도 합계" value={totalCap ? usd(totalCap) : "–"} hint={uncapped ? `한도 없는 팀 ${uncapped}개` : undefined} />
          <Metric label="경고 기준" value={`${warnPercent}%`} hint="설정에서 바꿀 수 있어요" />
        </div>
        <Button variant="primary" onClick={() => setDraft({ name: "", color: SWATCHES[5], description: "", budget: "" })}>
          <Plus /> 새 팀
        </Button>
      </div>

      <div className={cn("grid gap-3 sm:grid-cols-2 xl:grid-cols-3", pending && "opacity-70")}>
        {teams.map((t) => {
          const cap = t.monthlyBudgetMicros;
          const pct = cap ? (t.monthSpend / cap) * 100 : 0;
          const tone = pct >= 100 ? "danger" : pct >= warnPercent ? "warning" : "fg";
          return (
            <div key={t.id} className="group relative flex flex-col gap-4 overflow-hidden rounded-2xl border border-line bg-panel p-5">
              <span className="absolute inset-x-0 top-0 h-[3px]" style={{ background: t.color }} />
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl text-[15px] font-bold text-white" style={{ background: t.color }}>
                  {t.name.slice(0, 1)}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-[15px] font-semibold">{t.name}</h3>
                  <p className="truncate text-[12.5px] text-fg-3">{t.description || "설명 없음"}</p>
                </div>
                <div className="flex gap-0.5 opacity-60 transition group-hover:opacity-100">
                  <Tip content="편집">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label="편집"
                      onClick={() => setDraft({ id: t.id, name: t.name, color: t.color, description: t.description ?? "", budget: cap != null ? String(cap / 1_000_000) : "" })}
                    >
                      <Pencil />
                    </Button>
                  </Tip>
                  <Tip content={t.members > 0 ? "팀원이 있으면 삭제할 수 없어요" : "삭제"}>
                    <span>
                      <Button variant="ghost" size="icon-xs" aria-label="삭제" disabled={t.members > 0} onClick={() => remove(t)}>
                        <Trash2 />
                      </Button>
                    </span>
                  </Tip>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between">
                  <span className="text-[22px] font-semibold tabular-nums tracking-tight">{usd(t.monthSpend)}</span>
                  <span className="text-[12px] tabular-nums text-fg-3">{cap != null ? `한도 ${usd(cap)}` : "한도 없음"}</span>
                </div>
                {cap != null ? <Progress value={pct} tone={tone} /> : <div className="h-1.5 rounded-full border border-dashed border-line-2" />}
                <div className="flex items-center justify-between text-[11.5px] text-fg-4">
                  <span className="flex items-center gap-1">
                    <Users className="size-3.5" /> 활성 팀원 {t.members}명
                  </span>
                  {cap != null && <span className={cn("tabular-nums", tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : "")}>{Math.round(pct)}% 사용</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[12px] text-fg-4">
        한도는 매월 1일 0시(한국 시간)에 초기화돼요. 팀 한도와 개인 한도 중 하나라도 넘으면 새 생성이 막히고, 진행 중인 작업은 끝까지 처리돼요. 실패·검열된 생성은 합산하지 않아요.
      </p>

      <TeamDialog draft={draft} onClose={() => setDraft(null)} onSaved={() => startTransition(() => router.refresh())} />
      {confirmDialog}
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[12px] text-fg-3">{label}</span>
      <span className="text-[22px] font-semibold tabular-nums tracking-tight">{value}</span>
      {hint && <span className="text-[11px] text-fg-4">{hint}</span>}
    </div>
  );
}

function TeamDialog({ draft, onClose, onSaved }: { draft: Draft | null; onClose: () => void; onSaved: () => void }) {
  const [d, setD] = React.useState<Draft | null>(draft);
  const [saving, setSaving] = React.useState(false);
  const [prevDraft, setPrevDraft] = React.useState(draft);
  if (prevDraft !== draft) {
    setPrevDraft(draft);
    setD(draft);
  }
  const budgetNum = d && d.budget.trim() !== "" ? Number(d.budget) : null;
  const budgetInvalid = budgetNum !== null && (!Number.isFinite(budgetNum) || budgetNum < 0);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!d || budgetInvalid || !d.name.trim()) return;
    setSaving(true);
    try {
      const body = JSON.stringify({ name: d.name.trim(), color: d.color, description: d.description.trim() || null, monthlyBudgetUsd: budgetNum });
      await fetchJson(d.id ? `/api/admin/teams/${d.id}` : "/api/admin/teams", { method: d.id ? "PATCH" : "POST", body });
      toast.success(d.id ? "팀 정보를 저장했어요." : "팀을 만들었어요.");
      onSaved();
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!draft} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="sm" title={draft?.id ? "팀 편집" : "새 팀"}>
        {d && (
          <form onSubmit={save}>
            <DialogBody className="flex flex-col gap-4">
              <Field label="팀 이름">
                <Input autoFocus value={d.name} maxLength={40} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="예: AI제작팀" />
              </Field>
              <Field label="색상" hint="프로젝트·팀 표시에 쓰여요">
                <div className="flex flex-wrap items-center gap-1.5">
                  {SWATCHES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-label={c}
                      onClick={() => setD({ ...d, color: c })}
                      className={cn("size-7 rounded-full ring-offset-2 ring-offset-elevated transition", d.color.toLowerCase() === c.toLowerCase() ? "ring-2 ring-fg" : "hover:scale-110")}
                      style={{ background: c }}
                    />
                  ))}
                  <Input
                    value={d.color}
                    onChange={(e) => setD({ ...d, color: e.target.value })}
                    className="ml-1 h-8 w-24 font-mono text-[12px]"
                    maxLength={9}
                    aria-label="직접 입력"
                  />
                </div>
              </Field>
              <Field label="설명">
                <Input value={d.description} maxLength={200} onChange={(e) => setD({ ...d, description: e.target.value })} placeholder="예: AI 영상·이미지 제작" />
              </Field>
              <Field label="팀 월 한도 (USD)" hint="비워 두면 한도 없음" error={budgetInvalid ? "0 이상의 숫자를 입력해 주세요." : undefined}>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-fg-3">$</span>
                  <Input inputMode="decimal" value={d.budget} onChange={(e) => setD({ ...d, budget: e.target.value })} placeholder="한도 없음" className="pl-7 tabular-nums" />
                </div>
              </Field>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose}>
                취소
              </Button>
              <Button type="submit" variant="primary" loading={saving} disabled={!d.name.trim() || budgetInvalid}>
                저장
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
