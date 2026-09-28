"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CheckCheck, Copy, KeyRound, MoreHorizontal, RotateCcw, Search, Trash2, UserX, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Segmented, Select } from "@/components/ui/controls";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Avatar, Badge, EmptyState, Progress, TimeAgo } from "@/components/ui/misc";
import type { AdminUserRow } from "@/lib/services/admin";
import { ROLE_LABEL, STATUS_LABEL, type UserRole } from "@/lib/types";
import { cn, fetchJson, usd } from "@/lib/utils";

type StatusFilter = "all" | "pending" | "active" | "suspended";
export type TeamOption = { id: string; name: string; color: string };
type UsersResponse = { counts: { pending: number; active: number; suspended: number }; items: AdminUserRow[] };
type Patch = { status?: "active" | "suspended"; role?: UserRole; teamId?: string | null; monthlyBudgetUsd?: number | null };

const ROLE_OPTIONS: { value: UserRole; label: string; hint: string }[] = [
  { value: "member", label: ROLE_LABEL.member, hint: "생성·공유" },
  { value: "manager", label: ROLE_LABEL.manager, hint: "팀 전체 열람" },
  { value: "viewer", label: ROLE_LABEL.viewer, hint: "보기만" },
  { value: "admin", label: ROLE_LABEL.admin, hint: "전체 관리" },
];

const ROLE_HELP: { role: UserRole; text: string }[] = [
  { role: "member", text: "이미지·영상 생성, 프로젝트 생성·공유" },
  { role: "manager", text: "멤버 권한 + 팀의 비공개 프로젝트 열람, 팀 예산 경고 알림" },
  { role: "viewer", text: "공유받은 결과물 보기·코멘트만 (생성 불가)" },
  { role: "admin", text: "승인·권한·예산·모델 설정 등 전체 관리" },
];

function TeamDot({ color }: { color: string | null | undefined }) {
  return <span className="inline-block size-2 shrink-0 rounded-full" style={{ background: color ?? "var(--fg-4)" }} />;
}

export function UsersAdmin({ initialStatus, teams, meId }: { initialStatus: StatusFilter; teams: TeamOption[]; meId: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [status, setStatus] = React.useState<StatusFilter>(initialStatus);
  const [q, setQ] = React.useState("");
  const dq = React.useDeferredValue(q.trim());
  const [budgetFor, setBudgetFor] = React.useState<AdminUserRow | null>(null);
  const [tempPw, setTempPw] = React.useState<{ name: string; password: string } | null>(null);
  const [confirm, confirmDialog] = useConfirm();

  React.useEffect(() => {
    window.history.replaceState(null, "", status === "all" ? "/admin/users" : `/admin/users?status=${status}`);
  }, [status]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["admin-users", status, dq],
    queryFn: () => fetchJson<UsersResponse>(`/api/admin/users?status=${status}${dq ? `&q=${encodeURIComponent(dq)}` : ""}`),
    placeholderData: keepPreviousData,
  });

  const refresh = React.useCallback(() => {
    qc.invalidateQueries({ queryKey: ["admin-users"] });
    router.refresh(); // 사이드바 승인 대기 배지
  }, [qc, router]);

  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Patch; silent?: boolean }) =>
      fetchJson(`/api/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: (_d, v) => {
      if (!v.silent) toast.success("변경했어요.");
      refresh();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const counts = data?.counts;
  const items = data?.items ?? [];
  const pendingItems = items.filter((u) => u.status === "pending");
  const others = items.filter((u) => u.status !== "pending");
  const teamOptions = teams.map((t) => ({
    value: t.id,
    label: (
      <span className="flex items-center gap-2">
        <TeamDot color={t.color} />
        {t.name}
      </span>
    ),
  }));

  async function approve(u: AdminUserRow, teamId: string | null, role: UserRole) {
    await patch.mutateAsync({ id: u.id, body: { status: "active", role, teamId }, silent: true });
    toast.success(`${u.name}님을 승인했어요.`, { description: "승인 알림이 전달됐어요." });
  }

  async function approveAll() {
    if (!(await confirm({ title: `${pendingItems.length}명을 모두 승인할까요?`, description: "각자 가입할 때 고른 팀, '멤버' 권한으로 승인돼요.", confirmLabel: "모두 승인" }))) return;
    let ok = 0;
    for (const u of pendingItems) {
      try {
        await fetchJson(`/api/admin/users/${u.id}`, { method: "PATCH", body: JSON.stringify({ status: "active", role: "member", teamId: u.requestedTeamId ?? null }) });
        ok++;
      } catch (e) {
        toast.error(`${u.name}: ${(e as Error).message}`);
      }
    }
    toast.success(`${ok}명을 승인했어요.`);
    refresh();
  }

  async function reject(u: AdminUserRow) {
    if (!(await confirm({ title: `${u.name}님의 가입을 거절할까요?`, description: "계정이 삭제되고, 같은 이메일로 다시 가입 신청할 수 있어요.", confirmLabel: "거절", danger: true }))) return;
    try {
      await fetchJson(`/api/admin/users/${u.id}`, { method: "DELETE" });
      toast.success("가입 신청을 거절했어요.");
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function suspend(u: AdminUserRow) {
    if (!(await confirm({ title: `${u.name}님을 정지할까요?`, description: "즉시 로그아웃되고, 다시 활성화할 때까지 로그인할 수 없어요. 결과물은 그대로 남아요.", confirmLabel: "정지", danger: true }))) return;
    patch.mutate({ id: u.id, body: { status: "suspended" }, silent: true }, { onSuccess: () => toast.success("정지했어요.") });
  }

  async function remove(u: AdminUserRow) {
    if (!(await confirm({ title: `${u.name}님을 삭제할까요?`, description: "계정이 완전히 삭제돼요. 되돌릴 수 없어요.", confirmLabel: "삭제", danger: true }))) return;
    try {
      await fetchJson(`/api/admin/users/${u.id}`, { method: "DELETE" });
      toast.success("삭제했어요.");
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function resetPassword(u: AdminUserRow) {
    if (!(await confirm({ title: `${u.name}님의 비밀번호를 초기화할까요?`, description: "임시 비밀번호가 발급되고 모든 기기에서 로그아웃돼요.", confirmLabel: "초기화" }))) return;
    try {
      const r = await fetchJson<{ tempPassword: string }>(`/api/admin/users/${u.id}/reset-password`, { method: "POST" });
      setTempPw({ name: u.name, password: r.tempPassword });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          value={status}
          onChange={setStatus}
          options={[
            { value: "pending", label: <CountLabel label="승인 대기" n={counts?.pending} accent /> },
            { value: "active", label: <CountLabel label="활성" n={counts?.active} /> },
            { value: "suspended", label: <CountLabel label="정지" n={counts?.suspended} /> },
            { value: "all", label: "전체" },
          ]}
        />
        <div className="relative ml-auto w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-4" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="이름·이메일 검색"
            className="h-9 w-full rounded-[10px] border border-line-2 bg-panel/80 pl-9 pr-3 text-sm outline-none focus:border-fg-3"
          />
        </div>
      </div>

      <div className={cn("flex flex-col gap-5 transition-opacity", isFetching && !isLoading && "opacity-70")}>
        {isLoading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton h-16 rounded-2xl" />
            ))}
          </div>
        ) : (
          <>
            {pendingItems.length > 0 && (
              <section className="flex flex-col gap-2.5">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <h2 className="shrink-0 text-[14px] font-semibold">승인 대기</h2>
                  <Badge tone="accent">{pendingItems.length}</Badge>
                  <span className="order-last w-full text-[12px] text-fg-4 md:order-none md:w-auto">팀과 권한을 확인한 뒤 승인하세요. 승인하면 개인 작업공간이 자동으로 만들어져요.</span>
                  {pendingItems.length > 1 && (
                    <Button variant="ghost" size="sm" className="ml-auto" onClick={approveAll}>
                      <CheckCheck /> 희망 팀으로 모두 승인
                    </Button>
                  )}
                </div>
                {pendingItems.map((u) => (
                  <PendingCard key={u.id} u={u} teams={teams} teamOptions={teamOptions} onApprove={approve} onReject={reject} />
                ))}
              </section>
            )}

            {status !== "pending" &&
              (others.length === 0 ? (
                pendingItems.length === 0 && <EmptyState title={dq ? "검색 결과가 없어요" : "사용자가 없어요"} description={dq ? "다른 이름이나 이메일로 찾아보세요." : undefined} />
              ) : (
                <section className="overflow-hidden rounded-2xl border border-line bg-panel">
                  <div className="overflow-x-auto scrollbar-thin">
                    <table className="w-full min-w-[920px] text-[13px]">
                      <thead>
                        <tr className="border-b border-line text-left text-[11.5px] text-fg-4">
                          <th className="px-4 py-2.5 font-medium">구성원</th>
                          <th className="px-2 py-2.5 font-medium">팀</th>
                          <th className="px-2 py-2.5 font-medium">권한</th>
                          <th className="px-2 py-2.5 font-medium">이번 달 사용 / 개인 한도</th>
                          <th className="px-2 py-2.5 text-right font-medium">생성</th>
                          <th className="px-2 py-2.5 font-medium">가입</th>
                          <th className="w-12 px-2 py-2.5" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {others.map((u) => (
                          <UserRow
                            key={u.id}
                            u={u}
                            isMe={u.id === meId}
                            teamOptions={teamOptions}
                            onPatch={(body) => patch.mutate({ id: u.id, body })}
                            onBudget={() => setBudgetFor(u)}
                            onReset={() => resetPassword(u)}
                            onSuspend={() => suspend(u)}
                            onReactivate={() => patch.mutate({ id: u.id, body: { status: "active" }, silent: true }, { onSuccess: () => toast.success("다시 활성화했어요.") })}
                            onDelete={() => remove(u)}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ))}

            {status === "pending" && pendingItems.length === 0 && (
              <EmptyState icon={<Check />} title="승인 대기 중인 사람이 없어요" description="새 가입 신청이 오면 알림과 사이드바 배지로 알려드려요." />
            )}
          </>
        )}
      </div>

      <details className="group rounded-2xl border border-line bg-panel/60 px-4 py-3 text-[12.5px]">
        <summary className="cursor-pointer select-none text-fg-3 transition hover:text-fg-2">권한별로 할 수 있는 일</summary>
        <ul className="mt-2.5 grid gap-1.5 sm:grid-cols-2">
          {ROLE_HELP.map((r) => (
            <li key={r.role} className="flex gap-2">
              <span className="w-16 shrink-0 font-medium text-fg-2">{ROLE_LABEL[r.role]}</span>
              <span className="text-fg-3">{r.text}</span>
            </li>
          ))}
        </ul>
      </details>

      <BudgetDialog
        user={budgetFor}
        onClose={() => setBudgetFor(null)}
        onSave={(v) => {
          if (!budgetFor) return;
          patch.mutate({ id: budgetFor.id, body: { monthlyBudgetUsd: v }, silent: true }, { onSuccess: () => toast.success(v === null ? "개인 한도를 해제했어요." : `개인 한도를 $${v}로 설정했어요.`) });
          setBudgetFor(null);
        }}
      />
      <TempPasswordDialog value={tempPw} onClose={() => setTempPw(null)} />
      {confirmDialog}
    </div>
  );
}

function CountLabel({ label, n, accent }: { label: string; n?: number; accent?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      {label}
      {n !== undefined && n > 0 && (
        <span className={cn("rounded-full px-1.5 text-[10.5px] font-semibold tabular-nums", accent ? "bg-accent text-[#0a0a0a]" : "bg-panel-3 text-fg-3")}>{n}</span>
      )}
    </span>
  );
}

function PendingCard({
  u,
  teams,
  teamOptions,
  onApprove,
  onReject,
}: {
  u: AdminUserRow;
  teams: TeamOption[];
  teamOptions: { value: string; label: React.ReactNode }[];
  onApprove: (u: AdminUserRow, teamId: string | null, role: UserRole) => Promise<void>;
  onReject: (u: AdminUserRow) => void;
}) {
  const [teamId, setTeamId] = React.useState<string>(u.requestedTeamId ?? teams[0]?.id ?? "");
  const [role, setRole] = React.useState<UserRole>("member");
  const [busy, setBusy] = React.useState(false);
  const changedTeam = !!u.requestedTeamId && teamId !== u.requestedTeamId;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-accent/25 bg-panel p-4 shadow-[0_0_0_1px_var(--accent-soft)] lg:flex-row lg:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar name={u.name} image={u.image} size={40} />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-[14.5px] font-semibold">{u.name}</span>
            {u.jobTitle && <span className="truncate text-[12px] text-fg-3">{u.jobTitle}</span>}
          </div>
          <div className="truncate text-[12.5px] text-fg-3">{u.email}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-fg-4">
            <span>희망 팀 {u.requestedTeamName ?? "미선택"}</span>
            <span>·</span>
            <TimeAgo date={u.createdAt} />
            <span>신청</span>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-col gap-1">
          <Select size="sm" value={teamId} onValueChange={setTeamId} options={teamOptions} className="w-40" placeholder="팀 선택" />
          {changedTeam && <span className="text-[10.5px] text-warning">희망 팀과 달라요</span>}
        </div>
        <Select size="sm" value={role} onValueChange={(v) => setRole(v as UserRole)} options={ROLE_OPTIONS} className="w-32" />
        <Button variant="ghost" size="sm" onClick={() => onReject(u)}>
          거절
        </Button>
        <Button
          variant="primary"
          size="sm"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onApprove(u, teamId || null, role);
            } finally {
              setBusy(false);
            }
          }}
        >
          {!busy && <Check />} 승인
        </Button>
      </div>
    </div>
  );
}

function UserRow({
  u,
  isMe,
  teamOptions,
  onPatch,
  onBudget,
  onReset,
  onSuspend,
  onReactivate,
  onDelete,
}: {
  u: AdminUserRow;
  isMe: boolean;
  teamOptions: { value: string; label: React.ReactNode }[];
  onPatch: (body: Patch) => void;
  onBudget: () => void;
  onReset: () => void;
  onSuspend: () => void;
  onReactivate: () => void;
  onDelete: () => void;
}) {
  const cap = u.monthlyBudgetMicros;
  const pct = cap ? (u.monthSpend / cap) * 100 : 0;
  const suspended = u.status === "suspended";
  return (
    <tr className={cn("transition-colors hover:bg-panel-2/40", suspended && "opacity-60")}>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-3">
          <Avatar name={u.name} image={u.image} size={32} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate font-medium">{u.name}</span>
              {isMe && <Badge tone="outline">나</Badge>}
              {suspended && <Badge tone="danger">{STATUS_LABEL.suspended}</Badge>}
            </div>
            <div className="truncate text-[12px] text-fg-4">
              {u.email}
              {u.jobTitle ? ` · ${u.jobTitle}` : ""}
            </div>
          </div>
        </div>
      </td>
      <td className="px-2 py-2.5">
        <Select size="sm" value={u.teamId ?? undefined} placeholder="팀 없음" onValueChange={(v) => onPatch({ teamId: v })} options={teamOptions} className="w-36" />
      </td>
      <td className="px-2 py-2.5">
        <Select size="sm" value={u.role} disabled={isMe} onValueChange={(v) => onPatch({ role: v as UserRole })} options={ROLE_OPTIONS} className="w-32" />
      </td>
      <td className="px-2 py-2.5">
        <button onClick={onBudget} className="group flex w-44 flex-col gap-1 rounded-lg px-1.5 py-1 text-left transition hover:bg-panel-2">
          <span className="flex items-baseline gap-1 tabular-nums">
            <span className="font-medium">{usd(u.monthSpend)}</span>
            <span className="text-[11.5px] text-fg-4">/ {cap ? usd(cap) : "한도 없음"}</span>
          </span>
          {cap ? <Progress value={pct} tone={pct >= 100 ? "danger" : pct >= 80 ? "warning" : "fg"} className="h-1" /> : <span className="text-[10.5px] text-fg-4 opacity-0 transition group-hover:opacity-100">클릭해서 한도 설정</span>}
        </button>
      </td>
      <td className="px-2 py-2.5 text-right tabular-nums text-fg-2">{u.generationCount.toLocaleString()}</td>
      <td className="px-2 py-2.5 text-fg-3">
        <TimeAgo date={u.createdAt} />
      </td>
      <td className="px-2 py-2.5 text-right">
        <Menu>
          <MenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="더보기">
              <MoreHorizontal />
            </Button>
          </MenuTrigger>
          <MenuContent align="end">
            <MenuItem onSelect={onBudget}>
              <Wallet /> 개인 월 한도
            </MenuItem>
            <MenuItem onSelect={onReset}>
              <KeyRound /> 비밀번호 초기화
            </MenuItem>
            <MenuSeparator />
            {suspended ? (
              <MenuItem onSelect={onReactivate}>
                <RotateCcw /> 다시 활성화
              </MenuItem>
            ) : (
              <MenuItem danger disabled={isMe} onSelect={onSuspend}>
                <UserX /> 정지
              </MenuItem>
            )}
            <MenuItem danger disabled={isMe || u.generationCount > 0} onSelect={onDelete}>
              <Trash2 /> 삭제{u.generationCount > 0 ? " (생성 기록 있음)" : ""}
            </MenuItem>
          </MenuContent>
        </Menu>
      </td>
    </tr>
  );
}

function BudgetDialog({ user, onClose, onSave }: { user: AdminUserRow | null; onClose: () => void; onSave: (usd: number | null) => void }) {
  const [value, setValue] = React.useState("");
  const [prevUser, setPrevUser] = React.useState<AdminUserRow | null>(null);
  if (prevUser !== user) {
    setPrevUser(user);
    if (user) setValue(user.monthlyBudgetMicros != null ? String(user.monthlyBudgetMicros / 1_000_000) : "");
  }
  const num = value.trim() === "" ? null : Number(value);
  const invalid = num !== null && (!Number.isFinite(num) || num < 0);

  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="sm" title="개인 월 한도" description={user ? `${user.name} · 이번 달 ${usd(user.monthSpend, true)} 사용` : undefined}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!invalid) onSave(num);
          }}
        >
          <DialogBody className="flex flex-col gap-3">
            <Field label="한도 (USD)" hint="비워 두면 개인 한도 없이 팀 한도만 적용돼요. 매월 1일(한국 시간)에 초기화돼요." error={invalid ? "0 이상의 숫자를 입력해 주세요." : undefined}>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-fg-3">$</span>
                <Input autoFocus inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="한도 없음" className="pl-7 tabular-nums" />
              </div>
            </Field>
            <div className="flex flex-wrap gap-1.5">
              {[20, 50, 100, 200, 500].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setValue(String(v))}
                  className={cn("h-7 rounded-full border px-2.5 text-[12px] tabular-nums transition", String(v) === value ? "border-fg bg-inv text-inv-fg" : "border-line-2 text-fg-2 hover:border-line-3")}
                >
                  ${v}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setValue("")}
                className={cn("h-7 rounded-full border px-2.5 text-[12px] transition", value === "" ? "border-fg bg-inv text-inv-fg" : "border-line-2 text-fg-2 hover:border-line-3")}
              >
                한도 없음
              </button>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              취소
            </Button>
            <Button type="submit" variant="primary" disabled={invalid}>
              저장
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TempPasswordDialog({ value, onClose }: { value: { name: string; password: string } | null; onClose: () => void }) {
  const [copied, setCopied] = React.useState(false);
  const [prevValue, setPrevValue] = React.useState(value);
  if (prevValue !== value) {
    setPrevValue(value);
    setCopied(false);
  }
  return (
    <Dialog open={!!value} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="sm" title="임시 비밀번호가 발급됐어요" description={value ? `${value.name}님에게 직접 전달해 주세요. 이 창을 닫으면 다시 볼 수 없어요.` : undefined}>
        <DialogBody className="flex flex-col gap-3">
          <div className="flex items-center gap-2 rounded-xl border border-line-2 bg-panel-2 p-2 pl-4">
            <code className="flex-1 select-all font-mono text-[17px] tracking-wide">{value?.password}</code>
            <Button
              variant={copied ? "secondary" : "primary"}
              size="sm"
              onClick={async () => {
                if (!value) return;
                await navigator.clipboard.writeText(value.password);
                setCopied(true);
              }}
            >
              {copied ? <Check /> : <Copy />} {copied ? "복사됨" : "복사"}
            </Button>
          </div>
          <p className="text-[12px] text-fg-3">로그인한 뒤 [설정 → 계정]에서 비밀번호를 바꾸도록 안내해 주세요.</p>
        </DialogBody>
        <DialogFooter>
          <Button variant="primary" onClick={onClose}>
            확인
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
