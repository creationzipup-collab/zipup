import type { NextRequest } from "next/server";

import { handle } from "@/lib/api";
import { promptClips } from "@/lib/services/prompt-docs";
import { apiUser } from "@/lib/session";

type Ctx = { params: Promise<{ id: string }> };

/** 이 프롬프트로 나온 클립 (공유 썸네일 고르기) */
export const GET = handle(async (_req: NextRequest, ctx: Ctx) => {
  const u = await apiUser();
  return { items: await promptClips(u, (await ctx.params).id) };
});
