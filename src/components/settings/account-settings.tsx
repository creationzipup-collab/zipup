"use client";

import { Check, KeyRound, LogOut, Moon, Sun } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { PageTitle } from "@/components/brand/page-title";
import { useTheme } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/controls";
import { Field, Input } from "@/components/ui/input";
import { Avatar, Badge, Progress } from "@/components/ui/misc";
import { authClient } from "@/lib/auth-client";
import type { BudgetStatus } from "@/lib/services/budget";
import { ROLE_LABEL, type UserRole } from "@/lib/types";
import { cn, fetchJson, usd } from "@/lib/utils";

type Me = { name: string; email: string; image: string | null; jobTitle: string | null; role: UserRole; teamName: string | null; teamColor: string | null };
type Stats = { images: number; videos: number; uploads: number; favorites: number };

export function AccountSettings({ me, budget, stats, warnPercent }: { me: Me; budget: BudgetStatus; stats: Stats; warnPercent: number }) {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-6 sm:px-8 sm:py-8">
      <PageTitle label="Settings" title="설정" accent="Your setup." subtitle="내 프로필, 비밀번호, 화면, 이번 달 사용량을 관리해요." />
      <UsageCard budget={budget} stats={stats} warnPercent={warnPercent} />
      <ProfileSection me={me} />
      <PasswordSection />
      <AppearanceSection />
      <SessionSection />
    </div>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 rounded-2xl border border-line bg-panel p-5 md:grid-cols-[200px_1fr]">
      <div>
        <h2 className="text-[14px] font-semibold">{title}</h2>
        {description && <p className="mt-1 text-[12px] leading-relaxed text-fg-4">{description}</p>}
      </div>
      <div className="flex min-w-0 flex-col gap-4">{children}</div>
    </section>
  );
}

function Meter({ label, spent, cap, warnPercent }: { label: string; spent: number; cap: number | null; warnPercent: number }) {
  const pct = cap ? (spent / cap) * 100 : 0;
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-bg-2 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[12.5px] text-fg-3">{label}</span>
        <span className="text-[11.5px] tabular-nums text-fg-4">{cap != null ? `한도 ${usd(cap)}` : "한도 없음"}</span>
      </div>
      <span className="text-[26px] font-semibold tabular-nums tracking-tight">{usd(spent)}</span>
      {cap != null ? (
        <>
          <Progress value={pct} tone={pct >= 100 ? "danger" : pct >= warnPercent ? "warning" : "fg"} />
          <span className="text-[11.5px] tabular-nums text-fg-4">남은 예산 {usd(Math.max(0, cap - spent))}</span>
        </>
      ) : (
        <span className="text-[11.5px] text-fg-4">제한 없이 쓸 수 있어요</span>
      )}
    </div>
  );
}

function UsageCard({ budget, stats, warnPercent }: { budget: BudgetStatus; stats: Stats; warnPercent: number }) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-line bg-panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-[14px] font-semibold">이번 달 사용량</h2>
          <p className="text-[12px] text-fg-4">매월 1일(한국 시간)에 초기화돼요. 실패·검열된 생성은 합산하지 않아요.</p>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link href={`/library?q=${encodeURIComponent("@나")}`}>내 결과물 보기</Link>
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Meter label="내 사용 금액" spent={budget.user.spent} cap={budget.user.cap} warnPercent={warnPercent} />
        {budget.team ? (
          <Meter label={`${budget.team.name} 전체`} spent={budget.team.spent} cap={budget.team.cap} warnPercent={warnPercent} />
        ) : (
          <div className="flex items-center justify-center rounded-xl border border-dashed border-line-2 p-4 text-[12.5px] text-fg-4">소속 팀이 없어요</div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["이미지 생성", stats.images],
          ["영상 생성", stats.videos],
          ["업로드", stats.uploads],
          ["즐겨찾기", stats.favorites],
        ].map(([label, n]) => (
          <div key={label} className="flex flex-col rounded-xl bg-panel-2/60 px-3 py-2.5">
            <span className="text-[11.5px] text-fg-4">{label}</span>
            <span className="text-[18px] font-semibold tabular-nums">{Number(n).toLocaleString()}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function ProfileSection({ me }: { me: Me }) {
  const router = useRouter();
  const [name, setName] = React.useState(me.name);
  const [jobTitle, setJobTitle] = React.useState(me.jobTitle ?? "");
  const [saving, setSaving] = React.useState(false);
  const dirty = name.trim() !== me.name || (jobTitle.trim() || null) !== (me.jobTitle ?? null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await fetchJson("/api/me", { method: "PATCH", body: JSON.stringify({ name: name.trim(), jobTitle: jobTitle.trim() || null }) });
      toast.success("프로필을 저장했어요.");
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section title="프로필" description="이름은 결과물·코멘트·파일명({user})에 표시돼요.">
      <form onSubmit={save} className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Avatar name={name || me.name} image={me.image} size={48} />
          <div className="min-w-0">
            <div className="truncate text-[15px] font-semibold">{name || me.name}</div>
            <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-fg-3">
              <span className="truncate">{me.email}</span>
              {me.teamName && (
                <Badge tone="outline">
                  <span className="size-1.5 rounded-full" style={{ background: me.teamColor ?? "var(--fg-4)" }} />
                  {me.teamName}
                </Badge>
              )}
              <Badge>{ROLE_LABEL[me.role]}</Badge>
            </div>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="이름">
            <Input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="직함" hint="선택">
            <Input value={jobTitle} maxLength={40} onChange={(e) => setJobTitle(e.target.value)} placeholder="예: AI 아티스트" />
          </Field>
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-[12px] text-fg-4">팀·권한 변경은 관리자에게 요청해 주세요.</p>
          <Button type="submit" variant="primary" size="sm" loading={saving} disabled={!dirty || !name.trim()}>
            저장
          </Button>
        </div>
      </form>
    </Section>
  );
}

function PasswordSection() {
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const mismatch = confirm.length > 0 && next !== confirm;
  const tooShort = next.length > 0 && next.length < 8;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!current || next.length < 8 || next !== confirm) return;
    setSaving(true);
    try {
      const { error } = await authClient.changePassword({ currentPassword: current, newPassword: next, revokeOtherSessions: true });
      if (error) throw new Error(error.status === 400 || error.status === 401 ? "현재 비밀번호가 맞지 않아요." : (error.message ?? "변경하지 못했어요."));
      toast.success("비밀번호를 바꿨어요. 다른 기기에서는 로그아웃됐어요.");
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section title="비밀번호" description="관리자가 발급한 임시 비밀번호를 받았다면 여기서 바꿔 주세요.">
      <form onSubmit={save} className="flex flex-col gap-3">
        <Field label="현재 비밀번호">
          <Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="새 비밀번호" error={tooShort ? "8자 이상 입력해 주세요." : undefined}>
            <Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
          </Field>
          <Field label="새 비밀번호 확인" error={mismatch ? "새 비밀번호와 달라요." : undefined}>
            <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
        </div>
        <div className="flex justify-end">
          <Button type="submit" variant="primary" size="sm" loading={saving} disabled={!current || next.length < 8 || next !== confirm}>
            <KeyRound /> 비밀번호 변경
          </Button>
        </div>
      </form>
    </Section>
  );
}

function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  return (
    <Section title="화면" description="이 브라우저에만 적용돼요.">
      <div className="grid gap-3 sm:grid-cols-2">
        {(
          [
            ["dark", "다크", Moon, "어두운 화면에서 결과물 색이 더 정확하게 보여요"],
            ["light", "라이트", Sun, "밝은 사무실·인쇄물 검토용"],
          ] as const
        ).map(([value, label, Icon, hint]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTheme(value)}
            className={cn(
              "relative flex items-start gap-3 rounded-xl border p-4 text-left transition",
              theme === value ? "border-fg bg-panel-2" : "border-line-2 hover:border-line-3",
            )}
          >
            <span className={cn("flex size-9 items-center justify-center rounded-lg", value === "dark" ? "bg-[#0a0a0a] text-white ring-1 ring-white/10" : "bg-white text-[#0a0a0a] ring-1 ring-black/10")}>
              <Icon className="size-4" />
            </span>
            <span className="flex flex-col">
              <span className="text-[13.5px] font-medium">{label}</span>
              <span className="text-[12px] text-fg-4">{hint}</span>
            </span>
            {theme === value && <Check className="absolute right-3 top-3 size-4" />}
          </button>
        ))}
      </div>
    </Section>
  );
}

function SessionSection() {
  const router = useRouter();
  const [scope, setScope] = React.useState<"here" | "all">("here");
  const [busy, setBusy] = React.useState(false);
  return (
    <Section title="로그아웃" description="공용 PC에서는 꼭 로그아웃해 주세요.">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          value={scope}
          onChange={setScope}
          options={[
            { value: "here", label: "이 기기" },
            { value: "all", label: "모든 기기" },
          ]}
        />
        <Button
          variant="secondary"
          size="sm"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              if (scope === "all") await authClient.revokeSessions();
              await authClient.signOut();
              router.replace("/login");
            } finally {
              setBusy(false);
            }
          }}
        >
          <LogOut /> 로그아웃
        </Button>
      </div>
    </Section>
  );
}
