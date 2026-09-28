import type { NextRequest } from "next/server";
import { z } from "zod";

import { handle, readJson } from "@/lib/api";
import { deleteProject, projectOverview, updateProject } from "@/lib/services/projects";
import { apiUser } from "@/lib/session";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: NextRequest, ctx: Ctx) => {
  const u = await apiUser();
  return projectOverview(u, (await ctx.params).id);
});

const Patch = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().max(500).nullish(),
  visibility: z.enum(["private", "team", "company"]).optional(),
  color: z.string().max(20).nullish(),
  teamId: z.string().uuid().nullish(),
  archived: z.boolean().optional(),
  coverAssetId: z.string().uuid().nullish(),
});

export const PATCH = handle(async (req: NextRequest, ctx: Ctx) => {
  const u = await apiUser();
  const b = Patch.parse(await readJson(req));
  return { item: await updateProject(u, (await ctx.params).id, b) };
});

export const DELETE = handle(async (_req: NextRequest, ctx: Ctx) => {
  const u = await apiUser();
  await deleteProject(u, (await ctx.params).id);
  return { ok: true };
});
