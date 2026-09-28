import { count, eq } from "drizzle-orm";
import { AlertTriangle, ArrowRight, UserPlus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { UsageDashboard } from "@/components/admin/usage-dashboard";
import { TimeAgo } from "@/components/ui/misc";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { getModel } from "@/lib/models/registry";
import { isProviderConfigured } from "@/lib/providers";
import { queueStatus, recentFailures } from "@/lib/services/admin";
import { getSettings } from "@/lib/services/settings";

export const metadata: Metadata = { title: "관리자" };

export default async function AdminHome() {
  const [[{ value: pending }], queue, failures, settings] = await Promise.all([
    db.select({ value: count() }).from(user).where(eq(user.status, "pending")),
    queueStatus(),
    recentFailures(8),
    getSettings(),
  ]);
  const providers = [
    { id: "higgsfield" as const, name: "Higgsfield API", models: "GPT Image 2.5·2 · MiniMax H3 (기본) · Seedance 2.5 (대체)", configured: isProviderConfigured("higgsfield") },
    { id: "fal" as const, name: "fal.ai", models: "Seedream · Nano Banana · Seedance 드래프트 (기본) · GPT·H3 (대체) · 번역 LLM", configured: isProviderConfigured("fal") },
  ];
  const inflight = (p: string) => queue.filter((q) => q.provider === p).reduce((s, q) => s + q.n, 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 lg:grid-cols-3">
        {pending > 0 ? (
          <Link href="/admin/users?status=pending" className="corners group relative flex items-center gap-4 overflow-hidden rounded-2xl border border-accent/35 bg-accent/[0.06] p-4 transition hover:border-accent/60">
            <span className="num glow-text text-[44px]">{pending}</span>
            <span className="flex-1">
              <span className="block text-[14px] font-medium">가입 승인 대기</span>
              <span className="text-[12.5px] text-fg-3">팀과 권한을 지정해 승인해 주세요</span>
            </span>
            <ArrowRight className="size-4 text-fg-3 transition group-hover:translate-x-0.5" />
          </Link>
        ) : (
          <div className="corners flex items-center gap-4 rounded-2xl border border-line bg-white/[0.015] p-4">
            <span className="flex size-10 items-center justify-center rounded-full border border-dashed border-line-3 text-fg-3">
              <UserPlus className="size-4" />
            </span>
            <span>
              <span className="block text-[14px] font-medium">승인 대기 없음</span>
              <span className="text-[12.5px] text-fg-3">새 가입 신청이 오면 알림으로 알려드려요</span>
            </span>
          </div>
        )}
        {providers.map((p) => (
          <div key={p.id} className="flex flex-col gap-1.5 rounded-2xl border border-line bg-white/[0.015] p-4">
            <div className="flex items-center justify-between">
              <span className="text-[14px] font-medium">{p.name}</span>
              {p.configured ? (
                <span className="rounded-md bg-success/12 px-1.5 py-0.5 text-[11px] text-success">● 연결됨</span>
              ) : (
                <span className="rounded-md bg-warning/12 px-1.5 py-0.5 text-[11px] text-warning">{env.mockGeneration || !env.isProd ? "● 모의 생성" : "● 키 없음"}</span>
              )}
            </div>
            <span className="text-[12px] text-fg-3">{p.models}</span>
            <span className="mt-1 font-mono text-[11.5px] text-fg-4">
              진행 중 {inflight(p.id)} / 동시 한도 {settings.concurrency[p.id]}
            </span>
          </div>
        ))}
      </div>

      <UsageDashboard />

      <section className="rounded-2xl border border-line bg-white/[0.015]">
        <div className="flex items-center gap-2 border-b border-line px-5 py-3.5">
          <AlertTriangle className="size-4 text-fg-3" />
          <h2 className="text-[14px] font-medium">최근 실패한 생성</h2>
          <span className="text-[12px] text-fg-4">실패·검열은 과금되지 않아요</span>
        </div>
        {failures.length === 0 ? (
          <p className="px-5 py-6 text-sm text-fg-4">최근 실패가 없어요.</p>
        ) : (
          <ul className="divide-y divide-line">
            {failures.map((f) => (
              <li key={f.id} className="flex items-center gap-3 px-5 py-2.5 text-[13px]">
                <span className="w-32 shrink-0 truncate text-fg-2">{getModel(f.modelId)?.name ?? f.modelId}</span>
                <span className="w-20 shrink-0 text-fg-3">{f.userName}</span>
                <span className="min-w-0 flex-1 truncate text-fg-3">{f.errorMessage}</span>
                <TimeAgo date={f.createdAt} className="shrink-0 text-[11.5px] text-fg-4" />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
