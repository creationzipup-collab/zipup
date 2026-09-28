import { and, asc, eq, ilike, inArray, or } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { handle, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { comments, user } from "@/lib/db/schema";
import { forbidden, notFound } from "@/lib/errors";
import { atLeast } from "@/lib/services/access";
import { notify } from "@/lib/services/notifications";
import { assetAccess } from "@/lib/services/selection";
import { apiUser } from "@/lib/session";

async function load(u: Awaited<ReturnType<typeof apiUser>>, id: string) {
  const [a] = await assetAccess(u, [id]);
  if (!a || a.level === "none") throw notFound("파일을 찾을 수 없어요.");
  return a;
}

export const GET = handle(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const u = await apiUser();
  const { id } = await ctx.params;
  await load(u, id);
  const rows = await db
    .select({ id: comments.id, body: comments.body, createdAt: comments.createdAt, userId: comments.userId, userName: user.name, userImage: user.image })
    .from(comments)
    .innerJoin(user, eq(user.id, comments.userId))
    .where(eq(comments.assetId, id))
    .orderBy(asc(comments.createdAt));
  return { items: rows };
});

const Body = z.object({ body: z.string().trim().min(1).max(2000) });

export const POST = handle(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const u = await apiUser();
  const { id } = await ctx.params;
  const a = await load(u, id);
  if (!atLeast(a.level, "viewer")) throw forbidden();
  const { body } = Body.parse(await readJson(req));
  const [row] = await db.insert(comments).values({ assetId: id, userId: u.id, body }).returning();

  // @멘션 알림 + 파일 작성자 알림
  const mentions = Array.from(body.matchAll(/@([\p{L}\p{N}._-]{2,20})/gu)).map((m) => m[1]);
  const mentioned = mentions.length
    ? await db
        .select({ id: user.id })
        .from(user)
        .where(and(eq(user.status, "active"), or(inArray(user.name, mentions), ...mentions.map((m) => ilike(user.email, `${m}@%`)))))
    : [];
  const href = `/library?asset=${id}`;
  const mentionedIds = mentioned.map((m) => m.id).filter((x) => x !== u.id);
  if (mentionedIds.length) {
    await notify(mentionedIds, { type: "mention", title: `${u.name}님이 회원님을 언급했어요`, body: body.slice(0, 120), href });
  }
  if (a.asset.userId !== u.id && !mentionedIds.includes(a.asset.userId)) {
    await notify(a.asset.userId, { type: "comment", title: `${u.name}님이 코멘트를 남겼어요`, body: body.slice(0, 120), href });
  }
  return { item: { ...row, userName: u.name, userImage: u.image } };
});
