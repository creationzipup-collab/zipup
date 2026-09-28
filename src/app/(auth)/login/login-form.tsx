"use client";

import { ArrowRight, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

import { BrandLockup } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { signIn } from "@/lib/auth-client";

export function LoginForm({ next, googleEnabled }: { next?: string; googleEnabled: boolean }) {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [show, setShow] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await signIn.email({ email: email.trim(), password });
    setLoading(false);
    if (error) {
      setError(error.status === 401 || error.code === "INVALID_EMAIL_OR_PASSWORD" ? "이메일 또는 비밀번호가 맞지 않아요." : error.message ?? "로그인에 실패했어요.");
      return;
    }
    router.replace(next && next.startsWith("/") ? next : "/");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-5">
        <BrandLockup className="lg:hidden" />
        <div>
          <p className="section-index flex items-center gap-2 uppercase">
            <span className="h-px w-5 bg-accent" />
            Sign in
          </p>
          <h2 className="mt-2 text-[28px] font-semibold tracking-[-0.03em]">로그인</h2>
          <p className="mt-1.5 text-sm text-fg-3">크리에이션 집업 구성원 계정</p>
        </div>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="이메일" htmlFor="email">
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="name@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
        </Field>
        <Field label="비밀번호" htmlFor="password">
          <div className="relative">
            <Input
              id="password"
              type={show ? "text" : "password"}
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-fg-3 hover:text-fg"
              aria-label={show ? "비밀번호 숨기기" : "비밀번호 보기"}
            >
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </Field>
        {error && <p className="rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-[13px] text-danger">{error}</p>}
        <Button type="submit" variant="primary" size="lg" loading={loading} className="mt-1 w-full">
          로그인 <ArrowRight />
        </Button>
        {googleEnabled && (
          <Button
            type="button"
            variant="secondary"
            size="lg"
            className="w-full"
            onClick={() => signIn.social({ provider: "google", callbackURL: next && next.startsWith("/") ? next : "/" })}
          >
            <GoogleIcon /> Google로 계속하기
          </Button>
        )}
      </form>

      <p className="text-center text-sm text-fg-3">
        아직 계정이 없나요?{" "}
        <Link href="/signup" className="font-medium text-fg underline-offset-4 hover:underline">
          가입 신청
        </Link>
      </p>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path fill="#EA4335" d="M12 10.2v3.9h5.4c-.2 1.3-1.6 3.8-5.4 3.8-3.2 0-5.9-2.7-5.9-6s2.7-6 5.9-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.4 14.6 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12s4.3 9.6 9.6 9.6c5.5 0 9.2-3.9 9.2-9.4 0-.6-.1-1.1-.2-1.6H12z" />
    </svg>
  );
}
