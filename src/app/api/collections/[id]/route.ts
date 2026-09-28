import { and, eq, inArray, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { handle, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { collectionItems, collections, projects } from "@/lib/db/schema";
import { notFound } from "@/lib/errors";
import { requireProject } from "@/lib/services/access";
import { apiUser } from "@/lib/session";

type Ctx = { params: Promise<{ id: string }> };

async function load(id: string) {
  const [c] = await db
    .select({ c: collections, projectName: projects.name })
    .from(collections)
    .innerJoin(projects, eq(projects.id, collections.projectId))
    .where(eq(collections.id, id));
  if (!c) throw notFound("컬렉션을 찾을 수 없어요.");
  return c;
}

export const GET = handle(async (_req: NextRequest, ctx: Ctx) => {
  const u = await apiUser();
  const c = await load((await ctx.params).id);
  const { level } = await requireProject(u, c.c.projectId, "viewer");
  return { item: { ...c.c, projectName: c.projectName }, level };
});

const Patch = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  description: z.string().max(300).nullish(),
  add: z.array(z.string().uuid()).max(500).optional(),
  remove: z.array(z.string().uuid()).max(500).optional(),
});

export const PATCH = handle(async (req: NextRequest, ctx: Ctx) => {
  const u = await apiUser();
  const c = await load((await ctx.params).id);
  await requireProject(u, c.c.projectId, "editor");
  const b = Patch.parse(await readJson(req));
  if (b.name !== undefined || b.description !== undefined) {
    await db
      .update(collections)
      .set({ ...(b.name ? { name: b.name } : {}), ...(b.description !== undefined ? { description: b.description } : {}) })
      .where(eq(collections.id, c.c.id));
  }
  if (b.add?.length) {
    const [{ max }] = await db
      .select({ max: sql<number>`coalesce(max(${collectionItems.position}), 0)::int` })
      .from(collectionItems)
      .where(eq(collectionItems.collectionId, c.c.id));
    await db
      .insert(collectionItems)
      .values(b.add.map((assetId, i) => ({ collectionId: c.c.id, assetId, position: max + i + 1, addedBy: u.id })))
      .onConflictDoNothing();
    await db.update(collections).set({ updatedAt: new Date() }).where(eq(collections.id, c.c.id));
  }
  if (b.remove?.length) {
    await db
      .delete(collectionItems)
      .where(and(eq(collectionItems.collectionId, c.c.id), inArray(collectionItems.assetId, b.remove)));
  }
  return { ok: true };
});

export const DELETE = handle(async (_req: NextRequest, ctx: Ctx) => {
  const u = await apiUser();
  const c = await load((await ctx.params).id);
  await requireProject(u, c.c.projectId, "editor");
  await db.delete(collections).where(eq(collections.id, c.c.id));
  return { ok: true };
});
