import type { NextRequest } from "next/server";
import { z } from "zod";

import { handle, readJson } from "@/lib/api";
import { deleteUserAdmin, updateUserAdmin } from "@/lib/services/admin";
import { apiAdmin } from "@/lib/session";

type Ctx = { params: Promise<{ id: string }> };

const Patch = z.object({
  status: z.enum(["pending", "active", "suspended"]).optional(),
  role: z.enum(["admin", "manager", "member", "viewer"]).optional(),
  teamId: z.string().uuid().nullable().optional(),
  monthlyBudgetUsd: z.number().min(0).max(1_000_000).nullable().optional(),
  jobTitle: z.string().max(40).nullable().optional(),
  name: z.string().trim().min(1).max(40).optional(),
});

export const PATCH = handle(async (req: NextRequest, ctx: Ctx) => {
  const admin = await apiAdmin();
  const { monthlyBudgetUsd, ...rest } = Patch.parse(await readJson(req));
  const item = await updateUserAdmin(admin, (await ctx.params).id, {
    ...rest,
    ...(monthlyBudgetUsd !== undefined ? { monthlyBudgetMicros: monthlyBudgetUsd === null ? null : Math.round(monthlyBudgetUsd * 1_000_000) } : {}),
  });
  return { item: { id: item.id, status: item.status, role: item.role, teamId: item.teamId } };
});

export const DELETE = handle(async (_req: NextRequest, ctx: Ctx) => {
  const admin = await apiAdmin();
  await deleteUserAdmin(admin, (await ctx.params).id);
  return { ok: true };
});
