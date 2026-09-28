import "server-only";

import { randomBytes } from "node:crypto";

import { hashPassword } from "better-auth/crypto";
import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, lt, or, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { account, assets, auditLogs, generations, session, teams, user } from "@/lib/db/schema";
import { badRequest, notFound } from "@/lib/errors";
import { getModel } from "@/lib/models/registry";
import { monthStartKst } from "@/lib/money";
import { ensurePersonalProject } from "@/lib/services/access";
import { audit } from "@/lib/services/audit";
import { notify } from "@/lib/services/notifications";
import type { CurrentUser } from "@/lib/session";
import type { UserRole, UserStatus } from "@/lib/types";

const spend = sql<number>`coalesce(sum(coalesce(${generations.costMicros}, ${generations.estimatedCostMicros})) filter (where ${generations.status} not in ('failed','nsfw','canceled')), 0)::bigint`;

/* ---------------------------------- 사용량 ---------------------------------- */

export async function usageStats(range: { since: Date; until: Date }) {
  const inRange = and(gte(generations.createdAt, range.since), lt(generations.createdAt, range.until));

  const [totals] = await db
    .select({
      spend,
      total: sql<number>`count(*)::int`,
      completed: sql<number>`count(*) filter (where ${generations.status} = 'completed')::int`,
      failed: sql<number>`count(*) filter (where ${generations.status} in ('failed','nsfw'))::int`,
      users: sql<number>`count(distinct ${generations.userId})::int`,
      videos: sql<number>`count(*) filter (where ${generations.kind} = 'video')::int`,
    })
    .from(generations)
    .where(inRange);

  const kstDay = sql<string>`to_char(${generations.createdAt} at time zone 'Asia/Seoul', 'YYYY-MM-DD')`;
  const daily = await db
    .select({ day: kstDay, spend, count: sql<number>`count(*)::int` })
    .from(generations)
    .where(inRange)
    .groupBy(kstDay)
    .orderBy(kstDay);

  const byTeam = await db
    .select({ teamId: generations.teamId, name: teams.name, color: teams.color, cap: teams.monthlyBudgetMicros, spend, count: sql<number>`count(*)::int` })
    .from(generations)
    .leftJoin(teams, eq(teams.id, generations.teamId))
    .where(inRange)
    .groupBy(generations.teamId, teams.name, teams.color, teams.monthlyBudgetMicros)
    .orderBy(desc(spend));

  const byModel = await db
    .select({ modelId: generations.modelId, spend, count: sql<number>`count(*)::int` })
    .from(generations)
    .where(inRange)
    .groupBy(generations.modelId)
    .orderBy(desc(spend));

  const topUsers = await db
    .select({ userId: generations.userId, name: user.name, email: user.email, teamName: teams.name, spend, count: sql<number>`count(*)::int` })
    .from(generations)
    .innerJoin(user, eq(user.id, generations.userId))
    .leftJoin(teams, eq(teams.id, user.teamId))
    .where(inRange)
    .groupBy(generations.userId, user.name, user.email, teams.name)
    .orderBy(desc(spend))
    .limit(12);

  const [assetCount] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(assets)
    .where(and(gte(assets.createdAt, range.since), lt(assets.createdAt, range.until)));

  // 빈 날짜 채우기 (KST)
  const days: { day: string; spend: number; count: number }[] = [];
  const map = new Map(daily.map((d) => [d.day, d]));
  for (let t = range.since.getTime(); t < range.until.getTime(); t += 86400_000) {
    const k = new Date(t + 9 * 3600_000).toISOString().slice(0, 10);
    if (days.some((d) => d.day === k)) continue;
    const row = map.get(k);
    days.push({ day: k, spend: Number(row?.spend ?? 0), count: row?.count ?? 0 });
  }

  return {
    totals: {
      spend: Number(totals?.spend ?? 0),
      total: totals?.total ?? 0,
      completed: totals?.completed ?? 0,
      failed: totals?.failed ?? 0,
      users: totals?.users ?? 0,
      videos: totals?.videos ?? 0,
      assets: assetCount?.n ?? 0,
    },
    daily: days,
    byTeam: byTeam.map((t) => ({ ...t, name: t.name ?? "팀 없음", spend: Number(t.spend) })),
    byModel: byModel.map((m) => ({ ...m, name: getModel(m.modelId)?.name ?? m.modelId, spend: Number(m.spend) })),
    topUsers: topUsers.map((u) => ({ ...u, spend: Number(u.spend) })),
  };
}

export type UsageStats = Awaited<ReturnType<typeof usageStats>>;

/* ---------------------------------- 사용자 ---------------------------------- */

export async function listUsers(opts: { status?: UserStatus | "all"; q?: string }) {
  const since = monthStartKst();
  const conds = [];
  if (opts.status && opts.status !== "all") conds.push(eq(user.status, opts.status));
  if (opts.q) conds.push(or(ilike(user.name, `%${opts.q}%`), ilike(user.email, `%${opts.q}%`)));
  const rows = await db
    .select({
      u: user,
      teamName: teams.name,
      teamColor: teams.color,
      requestedTeamName: sql<string | null>`(select name from ${teams} rt where rt.id = ${user.requestedTeamId})`,
      monthSpend: sql<number>`(select coalesce(sum(coalesce(g.cost_micros, g.estimated_cost_micros)), 0)::bigint from ${generations} g where g.user_id = ${user.id} and g.created_at >= ${since} and g.status not in ('failed','nsfw','canceled'))`,
      generationCount: sql<number>`(select count(*)::int from ${generations} g where g.user_id = ${user.id})`,
    })
    .from(user)
    .leftJoin(teams, eq(teams.id, user.teamId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(sql`case ${user.status} when 'pending' then 0 when 'active' then 1 else 2 end`, desc(user.createdAt))
    .limit(500);
  const [counts] = await db
    .select({
      pending: sql<number>`count(*) filter (where ${user.status} = 'pending')::int`,
      active: sql<number>`count(*) filter (where ${user.status} = 'active')::int`,
      suspended: sql<number>`count(*) filter (where ${user.status} = 'suspended')::int`,
    })
    .from(user);
  return {
    counts,
    items: rows.map((r) => ({
      id: r.u.id,
      name: r.u.name,
      email: r.u.email,
      image: r.u.image,
      status: r.u.status,
      role: r.u.role,
      teamId: r.u.teamId,
      teamName: r.teamName,
      teamColor: r.teamColor,
      requestedTeamId: r.u.requestedTeamId,
      requestedTeamName: r.requestedTeamName,
      jobTitle: r.u.jobTitle,
      monthlyBudgetMicros: r.u.monthlyBudgetMicros,
      monthSpend: Number(r.monthSpend),
      generationCount: r.generationCount,
      createdAt: r.u.createdAt.toISOString(),
      approvedAt: r.u.approvedAt?.toISOString() ?? null,
    })),
  };
}

export type AdminUserRow = Awaited<ReturnType<typeof listUsers>>["items"][number];

export async function updateUserAdmin(
  admin: CurrentUser,
  userId: string,
  patch: { status?: UserStatus; role?: UserRole; teamId?: string | null; monthlyBudgetMicros?: number | null; jobTitle?: string | null; name?: string },
) {
  const [target] = await db.select().from(user).where(eq(user.id, userId));
  if (!target) throw notFound("사용자를 찾을 수 없어요.");
  if (userId === admin.id && (patch.status === "suspended" || (patch.role && patch.role !== "admin"))) {
    throw badRequest("자기 자신의 관리자 권한이나 상태는 바꿀 수 없어요.");
  }
  if (target.role === "admin" && patch.role && patch.role !== "admin") {
    const [{ value }] = await db.select({ value: count() }).from(user).where(and(eq(user.role, "admin"), eq(user.status, "active")));
    if (value <= 1) throw badRequest("마지막 관리자의 권한은 바꿀 수 없어요.");
  }
  if (patch.teamId) {
    const [t] = await db.select({ id: teams.id }).from(teams).where(eq(teams.id, patch.teamId));
    if (!t) throw badRequest("팀을 찾을 수 없어요.");
  }
  const set: Partial<typeof user.$inferInsert> = {};
  if (patch.status) set.status = patch.status;
  if (patch.role) set.role = patch.role;
  if (patch.teamId !== undefined) set.teamId = patch.teamId;
  if (patch.monthlyBudgetMicros !== undefined) set.monthlyBudgetMicros = patch.monthlyBudgetMicros;
  if (patch.jobTitle !== undefined) set.jobTitle = patch.jobTitle;
  if (patch.name) set.name = patch.name;
  const approving = target.status === "pending" && patch.status === "active";
  if (approving) {
    set.approvedAt = new Date();
    set.approvedBy = admin.id;
    if (patch.teamId === undefined && target.requestedTeamId) set.teamId = target.requestedTeamId;
  }
  const [updated] = await db.update(user).set(set).where(eq(user.id, userId)).returning();

  if (patch.status === "suspended") await db.delete(session).where(eq(session.userId, userId));
  if (approving) {
    await ensurePersonalProject(updated);
    const [t] = updated.teamId ? await db.select({ name: teams.name }).from(teams).where(eq(teams.id, updated.teamId)) : [];
    await notify(userId, {
      type: "account_approved",
      title: "가입이 승인됐어요 🎉",
      body: `${t?.name ?? "팀 미지정"} · ${patch.role ?? updated.role} 권한으로 이용할 수 있어요.`,
      href: "/",
    });
  }
  await audit(admin.id, approving ? "user.approve" : "user.update", { type: "user", id: userId }, patch as Record<string, unknown>);
  return updated;
}

/** 임시 비밀번호 발급 (이메일 발송 없이 관리자가 전달) */
export async function resetPasswordAdmin(admin: CurrentUser, userId: string) {
  const [acc] = await db
    .select()
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "credential")));
  const temp = `zipup-${randomBytes(4).toString("hex")}`;
  const hash = await hashPassword(temp);
  if (acc) {
    await db.update(account).set({ password: hash }).where(eq(account.id, acc.id));
  } else {
    await db.insert(account).values({
      id: randomBytes(16).toString("hex"),
      accountId: userId,
      providerId: "credential",
      userId,
      password: hash,
    });
  }
  await db.delete(session).where(eq(session.userId, userId));
  await audit(admin.id, "user.reset_password", { type: "user", id: userId });
  return { tempPassword: temp };
}

export async function deleteUserAdmin(admin: CurrentUser, userId: string) {
  if (userId === admin.id) throw badRequest("자기 자신은 삭제할 수 없어요.");
  const [target] = await db.select().from(user).where(eq(user.id, userId));
  if (!target) throw notFound();
  const [{ value }] = await db.select({ value: count() }).from(generations).where(eq(generations.userId, userId));
  if (value > 0) throw badRequest("생성 기록이 있는 사용자는 삭제 대신 '정지'해 주세요.");
  await db.delete(user).where(eq(user.id, userId));
  await audit(admin.id, "user.delete", { type: "user", id: userId }, { email: target.email });
}

/* ----------------------------------- 팀 ----------------------------------- */

export async function listTeamsAdmin() {
  const since = monthStartKst();
  const rows = await db
    .select({
      t: teams,
      members: sql<number>`(select count(*)::int from ${user} u where u.team_id = ${teams.id} and u.status = 'active')`,
      monthSpend: sql<number>`(select coalesce(sum(coalesce(g.cost_micros, g.estimated_cost_micros)), 0)::bigint from ${generations} g where g.team_id = ${teams.id} and g.created_at >= ${since} and g.status not in ('failed','nsfw','canceled'))`,
    })
    .from(teams)
    .orderBy(asc(teams.sortOrder), asc(teams.name));
  return rows.map((r) => ({ ...r.t, createdAt: r.t.createdAt.toISOString(), updatedAt: r.t.updatedAt.toISOString(), members: r.members, monthSpend: Number(r.monthSpend) }));
}

export async function upsertTeam(admin: CurrentUser, input: { id?: string; name: string; color?: string; description?: string | null; monthlyBudgetMicros?: number | null }) {
  const slug =
    input.name
      .toLowerCase()
      .replace(/[^a-z0-9가-힣]+/g, "-")
      .replace(/^-|-$/g, "") || `team-${Date.now()}`;
  if (input.id) {
    const [row] = await db
      .update(teams)
      .set({ name: input.name, color: input.color, description: input.description ?? null, monthlyBudgetMicros: input.monthlyBudgetMicros ?? null })
      .where(eq(teams.id, input.id))
      .returning();
    await audit(admin.id, "team.update", { type: "team", id: input.id }, input as Record<string, unknown>);
    return row;
  }
  const [row] = await db
    .insert(teams)
    .values({ name: input.name, slug: `${slug}-${Math.random().toString(36).slice(2, 5)}`, color: input.color ?? "#9CA3AF", description: input.description ?? null, monthlyBudgetMicros: input.monthlyBudgetMicros ?? null, sortOrder: 100 })
    .returning();
  await audit(admin.id, "team.create", { type: "team", id: row.id }, { name: input.name });
  return row;
}

export async function deleteTeam(admin: CurrentUser, id: string) {
  const [{ value }] = await db.select({ value: count() }).from(user).where(eq(user.teamId, id));
  if (value > 0) throw badRequest("팀원이 있는 팀은 삭제할 수 없어요. 먼저 팀원을 다른 팀으로 옮겨 주세요.");
  await db.delete(teams).where(eq(teams.id, id));
  await audit(admin.id, "team.delete", { type: "team", id });
}

/* -------------------------------- 감사 로그 -------------------------------- */

export async function listAudit(limit = 200) {
  return db
    .select({ id: auditLogs.id, action: auditLogs.action, targetType: auditLogs.targetType, targetId: auditLogs.targetId, meta: auditLogs.meta, createdAt: auditLogs.createdAt, actorName: user.name })
    .from(auditLogs)
    .leftJoin(user, eq(user.id, auditLogs.actorId))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);
}

/** 최근 실패 작업 */
export async function recentFailures(limit = 10) {
  return db
    .select({ id: generations.id, modelId: generations.modelId, status: generations.status, errorMessage: generations.errorMessage, createdAt: generations.createdAt, userName: user.name })
    .from(generations)
    .innerJoin(user, eq(user.id, generations.userId))
    .where(inArray(generations.status, ["failed", "nsfw"]))
    .orderBy(desc(generations.createdAt))
    .limit(limit);
}

/** 대기열 현황 */
export async function queueStatus() {
  const rows = await db
    .select({ provider: generations.provider, status: generations.status, n: sql<number>`count(*)::int` })
    .from(generations)
    .where(and(inArray(generations.status, ["pending", "queued", "in_progress", "finalizing"]), isNull(generations.completedAt)))
    .groupBy(generations.provider, generations.status);
  return rows;
}

