import { and, desc, eq, gte, inArray, or } from "drizzle-orm";
import { after } from "next/server";

import { handle } from "@/lib/api";
import { db } from "@/lib/db";
import { generations } from "@/lib/db/schema";
import { tick, toGenerationDTOs } from "@/lib/services/generation";
import { apiUser } from "@/lib/session";
import { ACTIVE_STATUSES } from "@/lib/types";

export const maxDuration = 60;

/**
 * 진행 중인 작업 + 최근 2분 안에 끝난 작업.
 * 호출될 때마다 백그라운드로 대기열 제출·상태 동기화를 진행합니다(웹훅이 없는 환경 대비).
 */
export const GET = handle(async (req: Request) => {
  const u = await apiUser();
  const url = new URL(req.url);
  const ids = url.searchParams.get("ids")?.split(",").filter(Boolean) ?? [];
  const since = new Date(Date.now() - 120_000);
  const rows = await db
    .select()
    .from(generations)
    .where(
      and(
        eq(generations.userId, u.id),
        or(
          inArray(generations.status, ACTIVE_STATUSES),
          gte(generations.completedAt, since),
          ids.length ? inArray(generations.id, ids.slice(0, 50)) : undefined,
        ),
      ),
    )
    .orderBy(desc(generations.createdAt))
    .limit(60);
  if (rows.some((r) => ACTIVE_STATUSES.includes(r.status))) {
    after(() => tick({ budgetMs: 25_000 }));
  }
  return { items: await toGenerationDTOs(rows), serverTime: new Date().toISOString() };
});
