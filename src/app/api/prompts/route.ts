import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";

import { handle, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { promptPresets, user } from "@/lib/db/schema";
import { apiUser } from "@/lib/session";

export const GET = handle(async (req: Request) => {
  const u = await apiUser();
  const p = new URL(req.url).searchParams;
  const scope = p.get("scope") ?? "all";
  const q = (p.get("q") ?? "").trim();
  const kind = p.get("kind");
  const visible = or(
    eq(promptPresets.userId, u.id),
    eq(promptPresets.visibility, "company"),
    u.teamId ? and(eq(promptPresets.visibility, "team"), eq(promptPresets.teamId, u.teamId)) : sql`false`,
  );
  const conds = [visible];
  if (scope === "mine") conds.push(eq(promptPresets.userId, u.id));
  if (scope === "team" && u.teamId) conds.push(eq(promptPresets.teamId, u.teamId));
  if (kind === "image" || kind === "video") conds.push(or(eq(promptPresets.kind, kind), eq(promptPresets.kind, "any")));
  if (q) {
    const pat = `%${q.replace(/[\\%_]/g, (m) => "\\" + m)}%`;
    conds.push(or(ilike(promptPresets.title, pat), ilike(promptPresets.prompt, pat), sql`array_to_string(${promptPresets.tags}, ' ') ilike ${pat}`));
  }
  const rows = await db
    .select({ p: promptPresets, author: user.name })
    .from(promptPresets)
    .innerJoin(user, eq(user.id, promptPresets.userId))
    .where(and(...conds))
    .orderBy(desc(promptPresets.useCount), desc(promptPresets.updatedAt))
    .limit(100);
  return { items: rows.map((r) => ({ ...r.p, author: r.author, mine: r.p.userId === u.id })) };
});

const Body = z.object({
  title: z.string().trim().min(1).max(80),
  prompt: z.string().trim().min(1).max(5000),
  kind: z.enum(["image", "video", "any"]).default("any"),
  modelId: z.string().max(60).nullish(),
  params: z.record(z.string(), z.unknown()).nullish(),
  tags: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
  visibility: z.enum(["private", "team", "company"]).default("team"),
});

export const POST = handle(async (req: Request) => {
  const u = await apiUser();
  const b = Body.parse(await readJson(req));
  const [row] = await db
    .insert(promptPresets)
    .values({ ...b, modelId: b.modelId ?? null, params: b.params ?? null, userId: u.id, teamId: u.teamId })
    .returning();
  return { item: row };
});
