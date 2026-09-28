import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/lib/env";
import { tick } from "@/lib/services/generation";

export const maxDuration = 300;

/**
 * Vercel Cron (vercel.json) — 기본은 하루 1번(Pro 플랜이면 매분으로 바꿀 수 있어요).
 * 대기열 제출, 놓친 웹훅 복구, 결과 저장 재시도를 담당합니다.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (env.cronSecret && auth !== `Bearer ${env.cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!env.cronSecret && env.isProd) {
    return NextResponse.json({ error: "CRON_SECRET이 설정되지 않았어요." }, { status: 500 });
  }
  const started = Date.now();
  let rounds = 0;
  let synced = 0;
  // 약 50초 동안 반복 (다음 크론 전까지 진행 중 작업을 계속 확인)
  while (Date.now() - started < 50_000) {
    const r = await tick({ force: true, budgetMs: 10_000, maxSync: 24 });
    rounds++;
    synced += r.synced ?? 0;
    if (!r.synced && rounds > 1) break;
    await new Promise((res) => setTimeout(res, 3_000));
  }
  return NextResponse.json({ ok: true, rounds, synced });
}
