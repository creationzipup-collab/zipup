"use client";

import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

import { BrandLockup } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { signUp } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

type Team = { id: string; name: string; color: string; description: string | null };

export function SignupForm({ teams, allowSignup, domains }: { teams: Team[]; allowSignup: boolean; domains: string[] }) {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [jobTitle, setJobTitle] = React.useState("");
  const [teamId, setTeamId] = React.useState<string>("");
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError("비밀번호는 8자 이상으로 정해 주세요.");
    if (!teamId) return setError("소속 팀을 골라 주세요.");
    setLoading(true);
    const { error } = await signUp.email({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password,
      requestedTeamId: teamId,
      jobTitle: jobTitle.trim() || undefined,
    });
    setLoading(false);
    if (error) {
      setError(
        error.code === "USER_ALREADY_EXISTS" || error.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL"
          ? "이미 가입된 이메일이에요. 로그인해 주세요."
          : error.message ?? "가입에 실패했어요.",
      );
      return;
    }
    // 승인 대기 사용자는 앱 레이아웃에서 /pending 으로 이동
    router.replace("/");
    router.refresh();
  }

  if (!allowSignup) {
    return (
      <div className="flex flex-col gap-4">
        <BrandLockup />
        <h2 className="text-2xl font-semibold tracking-tight">가입이 닫혀 있어요</h2>
        <p className="text-sm text-fg-3">관리자에게 계정 생성을 요청해 주세요.</p>
        <Button asChild variant="secondary">
          <Link href="/login">로그인으로</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-5">
        <BrandLockup className="lg:hidden" />
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">가입 신청</h2>
          <p className="mt-1.5 text-sm text-fg-3">신청하면 관리자가 확인 후 팀과 권한을 지정해 드려요.</p>
        </div>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="이름" htmlFor="name">
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="홍길동" required maxLength={40} autoFocus />
          </Field>
          <Field label="직책 (선택)" htmlFor="title">
            <Input id="title" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="PD, 디자이너…" maxLength={40} />
          </Field>
        </div>
        <Field
          label="회사 이메일"
          htmlFor="email"
          hint={domains.length ? `${domains.map((d) => "@" + d).join(", ")} 주소만 가입할 수 있어요.` : undefined}
        >
          <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" required />
        </Field>
        <Field label="비밀번호" htmlFor="pw" hint="8자 이상">
          <Input id="pw" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
        </Field>

        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-medium text-fg-2">소속 팀</span>
          <div className="grid grid-cols-2 gap-2">
            {teams.map((t) => {
              const active = teamId === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTeamId(t.id)}
                  className={cn(
                    "group relative flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition",
                    active ? "border-fg bg-panel-2" : "border-line-2 hover:border-line-3 hover:bg-panel-2/60",
                  )}
                >
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: t.color, boxShadow: `0 0 12px ${t.color}` }} />
                  <span className="flex min-w-0 flex-col">
                    <span className="text-[13px] font-medium">{t.name}</span>
                    {t.description && <span className="truncate text-[11px] text-fg-3">{t.description}</span>}
                  </span>
                  {active && <Check className="absolute right-2.5 top-2.5 size-3.5" />}
                </button>
              );
            })}
          </div>
        </div>

        {error && <p className="rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-[13px] text-danger">{error}</p>}
        <Button type="submit" variant="primary" size="lg" loading={loading} className="mt-1 w-full">
          가입 신청하기 <ArrowRight />
        </Button>
      </form>

      <p className="text-center text-sm text-fg-3">
        이미 계정이 있나요?{" "}
        <Link href="/login" className="font-medium text-fg underline-offset-4 hover:underline">
          로그인
        </Link>
      </p>
    </div>
  );
}
