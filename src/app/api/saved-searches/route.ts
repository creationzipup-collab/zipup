import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { handle, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { savedSearches } from "@/lib/db/schema";
import { apiUser } from "@/lib/session";

export const GET = handle(async () => {
  const u = await apiUser();
  const items = await db.select().from(savedSearches).where(eq(savedSearches.userId, u.id)).orderBy(desc(savedSearches.createdAt));
  return { items };
});

const Body = z.object({ name: z.string().trim().min(1).max(40), query: z.string().max(1000) });

export const POST = handle(async (req: Request) => {
  const u = await apiUser();
  const b = Body.parse(await readJson(req));
  const [item] = await db.insert(savedSearches).values({ userId: u.id, name: b.name, query: b.query }).returning();
  return { item };
});

export const DELETE = handle(async (req: Request) => {
  const u = await apiUser();
  const id = new URL(req.url).searchParams.get("id") ?? "";
  await db.delete(savedSearches).where(and(eq(savedSearches.id, id), eq(savedSearches.userId, u.id)));
  return { ok: true };
});
