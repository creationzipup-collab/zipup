import { eq, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { handle, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { promptPresets } from "@/lib/db/schema";
import { forbidden, notFound } from "@/lib/errors";
import { apiUser } from "@/lib/session";

async function own(id: string) {
  const u = await apiUser();
  const [row] = await db.select().from(promptPresets).where(eq(promptPresets.id, id));
  if (!row) throw notFound();
  return { u, row, canEdit: row.userId === u.id || u.role === "admin" };
}

const Patch = z.object({
  title: z.string().trim().min(1).max(80).optional(),
  prompt: z.string().trim().min(1).max(5000).optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(10).optional(),
  visibility: z.enum(["private", "team", "company"]).optional(),
  kind: z.enum(["image", "video", "any"]).optional(),
  used: z.boolean().optional(),
});

export const PATCH = handle(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const { row, canEdit } = await own(id);
  const b = Patch.parse(await readJson(req));
  if (b.used) {
    await db.update(promptPresets).set({ useCount: sql`${promptPresets.useCount} + 1` }).where(eq(promptPresets.id, row.id));
    return { ok: true };
  }
  if (!canEdit) throw forbidden();
  const { used: _u, ...rest } = b;
  void _u;
  const [updated] = await db.update(promptPresets).set(rest).where(eq(promptPresets.id, row.id)).returning();
  return { item: updated };
});

export const DELETE = handle(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const { row, canEdit } = await own(id);
  if (!canEdit) throw forbidden();
  await db.delete(promptPresets).where(eq(promptPresets.id, row.id));
  return { ok: true };
});
