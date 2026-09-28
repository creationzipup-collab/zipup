import type { NextRequest } from "next/server";
import { z } from "zod";

import { handle, readJson } from "@/lib/api";
import { listMessages, postMessage } from "@/lib/services/prompt-docs";
import { apiUser } from "@/lib/session";

type Ctx = { params: Promise<{ id: string }> };

/** 이 프롬프트의 대화 (열면 받은 공유가 "봤음"이 돼요) */
export const GET = handle(async (_req: NextRequest, ctx: Ctx) => {
  const u = await apiUser();
  return listMessages(u, (await ctx.params).id);
});

const Body = z.object({ body: z.string().trim().min(1).max(2000) });

export const POST = handle(async (req: NextRequest, ctx: Ctx) => {
  const u = await apiUser();
  const b = Body.parse(await readJson(req));
  return { item: await postMessage(u, (await ctx.params).id, b.body) };
});
