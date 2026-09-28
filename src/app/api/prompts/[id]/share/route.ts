import type { NextRequest } from "next/server";
import { z } from "zod";

import { handle, readJson } from "@/lib/api";
import { sharePrompt, unsharePrompt } from "@/lib/services/prompt-docs";
import { apiUser } from "@/lib/session";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  assetId: z.string().uuid().nullish(),
  title: z.string().trim().max(80).nullish(),
  tags: z.array(z.string().trim().min(1).max(30)).max(10).optional(),
  visibility: z.enum(["team", "company"]).default("team"),
});

/** 저장해 둔 프롬프트를 게시판에 올리기 (썸네일 클립은 골라도, 안 골라도) */
export const POST = handle(async (req: NextRequest, ctx: Ctx) => {
  const u = await apiUser();
  const b = Body.parse(await readJson(req));
  return { item: await sharePrompt(u, { ...b, presetId: (await ctx.params).id }) };
});

/** 게시판에서 내리기 */
export const DELETE = handle(async (_req: NextRequest, ctx: Ctx) => {
  const u = await apiUser();
  await unsharePrompt(u, (await ctx.params).id);
  return { ok: true };
});
