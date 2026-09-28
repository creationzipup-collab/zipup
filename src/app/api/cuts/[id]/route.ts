import type { NextRequest } from "next/server";
import { z } from "zod";

import { handle, readJson } from "@/lib/api";
import { deleteCut, updateCut } from "@/lib/services/cuts";
import { apiUser } from "@/lib/session";

type Ctx = { params: Promise<{ id: string }> };

const Patch = z.object({
  code: z.string().min(1).max(24).optional(),
  title: z.string().max(80).nullish(),
  note: z.string().max(2000).nullish(),
  status: z.enum(["todo", "wip", "review", "done"]).optional(),
  assigneeId: z.string().nullish(),
  coverAssetId: z.string().uuid().nullish(),
});

export const PATCH = handle(async (req: NextRequest, ctx: Ctx) => {
  const u = await apiUser();
  const b = Patch.parse(await readJson(req));
  return { item: await updateCut(u, (await ctx.params).id, b) };
});

export const DELETE = handle(async (_req: NextRequest, ctx: Ctx) => {
  const u = await apiUser();
  await deleteCut(u, (await ctx.params).id);
  return { ok: true };
});
