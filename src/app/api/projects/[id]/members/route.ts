import type { NextRequest } from "next/server";
import { z } from "zod";

import { handle, readJson } from "@/lib/api";
import { addMembers, listMembers, setMemberRole } from "@/lib/services/projects";
import { apiUser } from "@/lib/session";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: NextRequest, ctx: Ctx) => {
  const u = await apiUser();
  return { items: await listMembers(u, (await ctx.params).id) };
});

const Add = z.object({ userIds: z.array(z.string()).min(1).max(100), role: z.enum(["owner", "editor", "viewer"]).default("editor") });

export const POST = handle(async (req: NextRequest, ctx: Ctx) => {
  const u = await apiUser();
  const b = Add.parse(await readJson(req));
  await addMembers(u, (await ctx.params).id, b.userIds, b.role);
  return { ok: true };
});

const Role = z.object({ userId: z.string(), role: z.enum(["owner", "editor", "viewer"]).nullable() });

export const PATCH = handle(async (req: NextRequest, ctx: Ctx) => {
  const u = await apiUser();
  const b = Role.parse(await readJson(req));
  await setMemberRole(u, (await ctx.params).id, b.userId, b.role);
  return { ok: true };
});
