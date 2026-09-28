import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { handle, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { collectionItems, collections, projects } from "@/lib/db/schema";
import { requireProject, visibleProjectsWhere } from "@/lib/services/access";
import { apiUser } from "@/lib/session";

/** 볼 수 있는 프로젝트의 컬렉션 목록 */
export const GET = handle(async (req: Request) => {
  const u = await apiUser();
  const projectId = new URL(req.url).searchParams.get("projectId");
  const rows = await db
    .select({
      id: collections.id,
      name: collections.name,
      projectId: collections.projectId,
      projectName: projects.name,
      updatedAt: collections.updatedAt,
      count: sql<number>`(select count(*)::int from ${collectionItems} where ${collectionItems.collectionId} = ${collections.id})`,
    })
    .from(collections)
    .innerJoin(projects, eq(projects.id, collections.projectId))
    .where(and(visibleProjectsWhere(u), projectId ? eq(collections.projectId, projectId) : undefined))
    .orderBy(desc(collections.updatedAt))
    .limit(200);
  return { items: rows };
});

const Body = z.object({
  projectId: z.string().uuid(),
  name: z.string().trim().min(1).max(60),
  description: z.string().max(300).nullish(),
  assetIds: z.array(z.string().uuid()).max(500).optional(),
});

export const POST = handle(async (req: Request) => {
  const u = await apiUser();
  const b = Body.parse(await readJson(req));
  await requireProject(u, b.projectId, "editor");
  const [c] = await db
    .insert(collections)
    .values({ projectId: b.projectId, name: b.name, description: b.description ?? null, createdBy: u.id })
    .returning();
  if (b.assetIds?.length) {
    await db
      .insert(collectionItems)
      .values(b.assetIds.map((assetId, i) => ({ collectionId: c.id, assetId, position: i, addedBy: u.id })))
      .onConflictDoNothing();
  }
  return { item: c };
});
