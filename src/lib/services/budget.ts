import "server-only";

import { and, eq, gte, notInArray, sql } from "drizzle-orm";

import { db, type Tx } from "@/lib/db";
import { generations, teams, user } from "@/lib/db/schema";
import { HttpError } from "@/lib/errors";
import { formatUsd, monthStartKst } from "@/lib/money";
import { REFUNDED_STATUSES } from "@/lib/types";

type Exec = typeof db | Tx;

/** 과금 금액 합계 (확정 금액이 없으면 예상 금액) */
const spendExpr = sql<number>`coalesce(sum(coalesce(${generations.costMicros}, ${generations.estimatedCostMicros})), 0)::bigint`;

export async function spendSince(
  filter: { userId?: string; teamId?: string },
  since: Date,
  exec: Exec = db,
): Promise<number> {
  const conds = [gte(generations.createdAt, since), notInArray(generations.status, REFUNDED_STATUSES)];
  if (filter.userId) conds.push(eq(generations.userId, filter.userId));
  if (filter.teamId) conds.push(eq(generations.teamId, filter.teamId));
  const [row] = await exec.select({ total: spendExpr }).from(generations).where(and(...conds));
  return Number(row?.total ?? 0);
}

export type BudgetStatus = {
  user: { spent: number; cap: number | null };
  team: { id: string; name: string; spent: number; cap: number | null } | null;
};

export async function getBudgetStatus(u: { id: string; teamId: string | null }): Promise<BudgetStatus> {
  const since = monthStartKst();
  const [me] = await db.select({ cap: user.monthlyBudgetMicros }).from(user).where(eq(user.id, u.id));
  const userSpent = await spendSince({ userId: u.id }, since);
  let team: BudgetStatus["team"] = null;
  if (u.teamId) {
    const [t] = await db.select().from(teams).where(eq(teams.id, u.teamId));
    if (t) {
      team = {
        id: t.id,
        name: t.name,
        spent: await spendSince({ teamId: t.id }, since),
        cap: t.monthlyBudgetMicros ?? null,
      };
    }
  }
  return { user: { spent: userSpent, cap: me?.cap ?? null }, team };
}

/**
 * 트랜잭션 안에서 예산 확인. 동시 요청으로 한도를 넘지 않도록 팀·사용자 단위 advisory lock 사용.
 */
export async function assertBudget(tx: Tx, u: { id: string; teamId: string | null }, addMicros: number) {
  const since = monthStartKst();
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"budget:user:" + u.id}))`);
  if (u.teamId) await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"budget:team:" + u.teamId}))`);

  const [me] = await tx.select({ cap: user.monthlyBudgetMicros }).from(user).where(eq(user.id, u.id));
  if (me?.cap != null) {
    const spent = await spendSince({ userId: u.id }, since, tx);
    if (spent + addMicros > me.cap) {
      throw new HttpError(
        402,
        `이번 달 개인 예산(${formatUsd(me.cap)})을 넘어요. 남은 예산 ${formatUsd(Math.max(0, me.cap - spent))}, 이번 요청 ${formatUsd(addMicros)}.`,
        "budget_exceeded",
        { scope: "user", cap: me.cap, spent, request: addMicros },
      );
    }
  }
  if (u.teamId) {
    const [t] = await tx.select({ cap: teams.monthlyBudgetMicros, name: teams.name }).from(teams).where(eq(teams.id, u.teamId));
    if (t?.cap != null) {
      const spent = await spendSince({ teamId: u.teamId }, since, tx);
      if (spent + addMicros > t.cap) {
        throw new HttpError(
          402,
          `이번 달 ${t.name} 예산(${formatUsd(t.cap)})을 넘어요. 남은 예산 ${formatUsd(Math.max(0, t.cap - spent))}, 이번 요청 ${formatUsd(addMicros)}.`,
          "budget_exceeded",
          { scope: "team", cap: t.cap, spent, request: addMicros },
        );
      }
    }
  }
}
