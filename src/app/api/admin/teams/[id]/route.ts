import type { NextRequest } from "next/server";
import { z } from "zod";

import { handle, readJson } from "@/lib/api";
import { deleteTeam, upsertTeam } from "@/lib/services/admin";
import { apiAdmin } from "@/lib/session";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  name: z.string().trim().min(1).max(40),
  color: z.string().max(20).optional(),
  description: z.string().max(200).nullish(),
  monthlyBudgetUsd: z.number().min(0).max(10_000_000).nullable().optional(),
});

export const PATCH = handle(async (req: NextRequest, ctx: Ctx) => {
  const admin = await apiAdmin();
  const b = Body.parse(await readJson(req));
  const item = await upsertTeam(admin, {
    id: (await ctx.params).id,
    name: b.name,
    color: b.color,
    description: b.description,
    monthlyBudgetMicros: b.monthlyBudgetUsd == null ? null : Math.round(b.monthlyBudgetUsd * 1_000_000),
  });
  return { item };
});

export const DELETE = handle(async (_req: NextRequest, ctx: Ctx) => {
  const admin = await apiAdmin();
  await deleteTeam(admin, (await ctx.params).id);
  return { ok: true };
});
