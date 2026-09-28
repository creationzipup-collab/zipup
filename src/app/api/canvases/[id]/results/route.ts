import type { NextRequest } from "next/server";

import { handle } from "@/lib/api";
import { canvasResults } from "@/lib/services/canvas";
import { apiUser } from "@/lib/session";

type Ctx = { params: Promise<{ id: string }> };

/** 캔버스 결과 모음 (모든 참여자의 실행) */
export const GET = handle(async (req: NextRequest, ctx: Ctx) => {
  const u = await apiUser();
  const limit = Number(new URL(req.url).searchParams.get("limit") ?? 120);
  return canvasResults(u, (await ctx.params).id, { limit: Number.isFinite(limit) ? limit : 120 });
});
