import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";

import { handle } from "@/lib/api";
import { db } from "@/lib/db";
import { generations } from "@/lib/db/schema";
import { forbidden, notFound } from "@/lib/errors";
import { cancelGeneration, syncGeneration, toGenerationDTOs } from "@/lib/services/generation";
import { apiUser } from "@/lib/session";

export const maxDuration = 60;

export const GET = handle(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const u = await apiUser();
  const { id } = await ctx.params;
  let [gen] = await db.select().from(generations).where(eq(generations.id, id));
  if (!gen) throw notFound();
  if (gen.userId !== u.id && u.role !== "admin") throw forbidden();
  if (["queued", "in_progress"].includes(gen.status) && (!gen.nextPollAt || gen.nextPollAt.getTime() <= Date.now())) {
    await syncGeneration(gen.id);
    [gen] = await db.select().from(generations).where(eq(generations.id, id));
  }
  const [dto] = await toGenerationDTOs([gen]);
  return dto;
});

export const DELETE = handle(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const u = await apiUser();
  const { id } = await ctx.params;
  return cancelGeneration(u, id);
});
