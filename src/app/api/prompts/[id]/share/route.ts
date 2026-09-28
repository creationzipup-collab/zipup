import type { NextRequest } from "next/server";

import { handle } from "@/lib/api";
import { unsharePrompt } from "@/lib/services/prompt-docs";
import { apiUser } from "@/lib/session";

type Ctx = { params: Promise<{ id: string }> };

/** 내가 보낸 공유 거두기 (저장은 남아요) */
export const DELETE = handle(async (_req: NextRequest, ctx: Ctx) => {
  const u = await apiUser();
  await unsharePrompt(u, (await ctx.params).id);
  return { ok: true };
});
