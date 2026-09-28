import { z } from "zod";

import { handle, readJson } from "@/lib/api";
import { listTeamsAdmin, upsertTeam } from "@/lib/services/admin";
import { apiAdmin } from "@/lib/session";

export const GET = handle(async () => {
  await apiAdmin();
  return { items: await listTeamsAdmin() };
});

const Body = z.object({
  name: z.string().trim().min(1).max(40),
  color: z.string().max(20).optional(),
  description: z.string().max(200).nullish(),
  monthlyBudgetUsd: z.number().min(0).max(10_000_000).nullable().optional(),
});

export const POST = handle(async (req: Request) => {
  const admin = await apiAdmin();
  const b = Body.parse(await readJson(req));
  const item = await upsertTeam(admin, {
    name: b.name,
    color: b.color,
    description: b.description,
    monthlyBudgetMicros: b.monthlyBudgetUsd == null ? null : Math.round(b.monthlyBudgetUsd * 1_000_000),
  });
  return { item };
});
