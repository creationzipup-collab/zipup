import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LogoFull } from "@/components/brand/logo";
import { db } from "@/lib/db";
import { teams } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/session";

import { PendingActions } from "./pending-actions";

export const metadata: Metadata = { title: "승인 대기" };

export default async function PendingPage() {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  if (u.status === "active") redirect("/");
  if (u.status === "suspended") redirect("/suspended");
  let requested: string | null = null;
  if (u.requestedTeamId) {
    const [t] = await db.select({ name: teams.name }).from(teams).where(eq(teams.id, u.requestedTeamId));
    requested = t?.name ?? null;
  }
  return (
    <div className="grain relative flex min-h-dvh items-center justify-center overflow-hidden px-5">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/3 size-[520px] -translate-x-1/2 rounded-full bg-accent opacity-[0.10] blur-[140px]" />
      </div>
      <div className="relative flex w-full max-w-md flex-col items-center gap-8 text-center animate-fade-up">
        <LogoFull className="w-40 text-fg" />
        <div className="relative flex size-20 items-center justify-center">
          <span className="absolute inset-0 animate-ping rounded-full border border-accent/40" />
          <span className="absolute inset-3 rounded-full border border-line-2" />
          <span className="size-3 animate-pulse-dot rounded-full bg-accent shadow-[0_0_24px_var(--accent)]" />
        </div>
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">승인을 기다리고 있어요</h1>
          <p className="text-sm leading-relaxed text-fg-3">
            {u.name}님의 가입 신청이 접수됐어요. 관리자가 팀과 권한을 지정하면 바로 이용할 수 있어요.
            <br />이 페이지는 자동으로 새로고침돼요.
          </p>
        </div>
        <dl className="grid w-full grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line text-left">
          <div className="bg-panel px-4 py-3">
            <dt className="eyebrow">Email</dt>
            <dd className="mt-1 truncate text-sm">{u.email}</dd>
          </div>
          <div className="bg-panel px-4 py-3">
            <dt className="text-[11.5px] font-medium text-fg-3">희망 팀</dt>
            <dd className="mt-1 text-sm">{requested ?? "-"}</dd>
          </div>
        </dl>
        <PendingActions />
      </div>
    </div>
  );
}
