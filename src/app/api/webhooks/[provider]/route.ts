import { after, NextResponse, type NextRequest } from "next/server";

import { syncGeneration, tick, verifyWebhookSignature } from "@/lib/services/generation";

export const maxDuration = 300;

/**
 * Higgsfield(hf_webhook) / fal(fal_webhook) 완료 알림.
 * 본문은 신뢰하지 않고, 서명된 generation ID로 공급자 API에서 상태를 다시 조회합니다.
 * 10초 안에 2xx를 돌려주고 결과 저장은 응답 후에 진행합니다.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  const url = new URL(req.url);
  const gid = url.searchParams.get("gid") ?? "";
  const sig = url.searchParams.get("sig") ?? "";
  if (!["higgsfield", "fal"].includes(provider) || !gid || !sig || !verifyWebhookSignature(gid, sig)) {
    return NextResponse.json({ error: "invalid webhook" }, { status: 401 });
  }
  // 본문은 로깅 목적 외에는 사용하지 않음
  await req.text().catch(() => "");
  after(async () => {
    await syncGeneration(gid);
    await tick({ force: true, budgetMs: 20_000 });
  });
  return NextResponse.json({ ok: true });
}
