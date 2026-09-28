import "server-only";

import { desc, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { canvases, generations, user } from "@/lib/db/schema";
import { notFound } from "@/lib/errors";
import type { CurrentUser } from "@/lib/session";
import { requireProject } from "@/lib/services/access";
import { toGenerationDTOs, type GenerationDTO } from "@/lib/services/generation";

export type CanvasResult = GenerationDTO & { userId: string; userName: string };

/**
 * 캔버스 결과 모음: 이 캔버스에서 누가 돌렸든 모든 실행을 최신 순으로.
 * 프로젝트를 볼 수 있으면 다른 사람이 만든 결과도 함께 보여요.
 */
export async function canvasResults(u: CurrentUser, canvasId: string, opts: { limit?: number } = {}): Promise<{ items: CanvasResult[]; hasMore: boolean }> {
  const [c] = await db.select({ id: canvases.id, projectId: canvases.projectId }).from(canvases).where(eq(canvases.id, canvasId));
  if (!c) throw notFound("캔버스를 찾을 수 없어요.");
  await requireProject(u, c.projectId, "viewer");

  const limit = Math.min(300, Math.max(1, opts.limit ?? 120));
  const rows = await db.select().from(generations).where(eq(generations.canvasId, c.id)).orderBy(desc(generations.createdAt)).limit(limit + 1);
  const page = rows.slice(0, limit);
  const dtos = await toGenerationDTOs(page);

  const userIds = Array.from(new Set(page.map((r) => r.userId)));
  const names = new Map(userIds.length ? (await db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, userIds))).map((x) => [x.id, x.name]) : []);
  return {
    items: dtos.map((d, i) => ({ ...d, userId: page[i].userId, userName: names.get(page[i].userId) ?? "" })),
    hasMore: rows.length > limit,
  };
}
