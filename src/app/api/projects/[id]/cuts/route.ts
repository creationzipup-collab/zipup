import type { NextRequest } from "next/server";
import { z } from "zod";

import { handle, readJson } from "@/lib/api";
import { createCuts, cutBoard, cutOptions, reorderCuts } from "@/lib/services/cuts";
import { apiUser } from "@/lib/session";

type Ctx = { params: Promise<{ id: string }> };

/** 컷 보드 (?lite=1 이면 스튜디오 선택용 목록만) */
export const GET = handle(async (req: NextRequest, ctx: Ctx) => {
  const u = await apiUser();
  const id = (await ctx.params).id;
  if (new URL(req.url).searchParams.get("lite") === "1") return { items: await cutOptions(u, id) };
  return cutBoard(u, id);
});

const Create = z.object({
  code: z.string().max(24).nullish(),
  title: z.string().max(80).nullish(),
  count: z.number().int().min(1).max(200).optional(),
});

export const POST = handle(async (req: NextRequest, ctx: Ctx) => {
  const u = await apiUser();
  const b = Create.parse(await readJson(req));
  return { items: await createCuts(u, (await ctx.params).id, b) };
});

const Reorder = z.object({ ids: z.array(z.string().uuid()).max(1000) });

/** 순서 바꾸기 */
export const PUT = handle(async (req: NextRequest, ctx: Ctx) => {
  const u = await apiUser();
  const { ids } = Reorder.parse(await readJson(req));
  await reorderCuts(u, (await ctx.params).id, ids);
  return { ok: true };
});
