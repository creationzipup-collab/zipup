import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { handle, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { canvases } from "@/lib/db/schema";
import { notFound } from "@/lib/errors";
import { requireProject } from "@/lib/services/access";
import { apiUser } from "@/lib/session";

type Ctx = { params: Promise<{ id: string }> };

async function load(id: string) {
  const [c] = await db.select().from(canvases).where(eq(canvases.id, id));
  if (!c) throw notFound("캔버스를 찾을 수 없어요.");
  return c;
}

export const GET = handle(async (_req: NextRequest, ctx: Ctx) => {
  const u = await apiUser();
  const c = await load((await ctx.params).id);
  const { level } = await requireProject(u, c.projectId, "viewer");
  return { item: c, level };
});

const Patch = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  graph: z
    .object({
      nodes: z.array(z.unknown()).max(300),
      edges: z.array(z.unknown()).max(600),
      viewport: z.object({ x: z.number(), y: z.number(), zoom: z.number() }).optional(),
    })
    .optional(),
});

export const PATCH = handle(async (req: NextRequest, ctx: Ctx) => {
  const u = await apiUser();
  const c = await load((await ctx.params).id);
  await requireProject(u, c.projectId, "editor");
  const b = Patch.parse(await readJson(req));
  const [item] = await db
    .update(canvases)
    .set({ ...(b.name ? { name: b.name } : {}), ...(b.graph ? { graph: b.graph } : {}), updatedBy: u.id })
    .where(eq(canvases.id, c.id))
    .returning({ id: canvases.id, updatedAt: canvases.updatedAt });
  return { item };
});

export const DELETE = handle(async (_req: NextRequest, ctx: Ctx) => {
  const u = await apiUser();
  const c = await load((await ctx.params).id);
  await requireProject(u, c.projectId, "editor");
  await db.delete(canvases).where(eq(canvases.id, c.id));
  return { ok: true };
});
