import "server-only";

import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { assets, cuts, generations, projects, user } from "@/lib/db/schema";
import { visibleProjectsWhere } from "@/lib/services/access";
import { assetUrls } from "@/lib/services/assets";
import type { CurrentUser } from "@/lib/session";
import { ACTIVE_STATUSES, type CutStatus, type Flag } from "@/lib/types";

export type HomeTake = {
  id: string;
  kind: "image" | "video";
  width: number | null;
  height: number | null;
  durationSec: number | null;
  take: number | null;
  flag: Flag | null;
  prompt: string;
  projectId: string;
  projectName: string;
  cutCode: string | null;
  userName: string;
  createdAt: string;
  urls: { thumb: string; src: string };
};

export type HomeCut = {
  id: string;
  projectId: string;
  projectName: string;
  projectColor: string | null;
  code: string;
  title: string | null;
  status: CutStatus;
  assignee: string | null;
  mine: boolean;
  takes: number;
  ok: number;
  live: string[];
  recent: { id: string; kind: "image" | "video"; flag: Flag | null; thumb: string }[];
  lastActivityAt: string;
};

export type HomeProject = {
  id: string;
  name: string;
  color: string | null;
  isPersonal: boolean;
  lastActivityAt: string;
  cuts: Record<CutStatus, number>;
  takes: number;
  ok: number;
};

export type HomeLive = { userName: string; modelId: string; kind: "image" | "video"; projectName: string; cutCode: string | null; since: string };

export type HomeBoard = {
  stats: { activeCuts: number; todayTakes: number; monthTakes: number; monthOk: number; monthNg: number; monthKeep: number; generating: number };
  /** 최근 14일 하루 테이크 수 (한국 날짜) */
  daily: { label: string; value: number }[];
  cuts: HomeCut[];
  live: HomeLive[];
  projects: HomeProject[];
  ok: HomeTake[];
  mine: HomeTake[];
  backdrop: string | null;
  /** 오늘 (한국 시간) */
  today: { y: number; m: number; d: number; wd: number };
};

const KST = 9 * 3600_000;

function kstStarts() {
  const k = new Date(Date.now() + KST);
  const y = k.getUTCFullYear();
  const m = k.getUTCMonth();
  const d = k.getUTCDate();
  return { day: new Date(Date.UTC(y, m, d) - KST), month: new Date(Date.UTC(y, m, 1) - KST), today: { y, m: m + 1, d, wd: k.getUTCDay() } };
}

/** 오늘까지 n일의 한국 날짜 키 (YYYY-MM-DD) */
function lastDays(day: Date, n: number): string[] {
  return Array.from({ length: n }, (_, i) => new Date(day.getTime() + KST - (n - 1 - i) * 86400_000).toISOString().slice(0, 10));
}

/** 홈: 지금 스튜디오에서 무슨 일이 일어나고 있는지 (진행 중인 컷, 생성 중인 사람, 프로젝트 진행, 최근 OK) */
export async function homeBoard(u: CurrentUser): Promise<HomeBoard> {
  const { day, month, today } = kstStarts();
  const visible = await db
    .select({ id: projects.id, name: projects.name, color: projects.color, isPersonal: projects.isPersonal, lastActivityAt: projects.lastActivityAt })
    .from(projects)
    .where(and(visibleProjectsWhere(u), isNull(projects.archivedAt)))
    .orderBy(desc(projects.lastActivityAt))
    .limit(200);
  const ids = visible.map((p) => p.id);
  if (!ids.length) {
    return {
      stats: { activeCuts: 0, todayTakes: 0, monthTakes: 0, monthOk: 0, monthNg: 0, monthKeep: 0, generating: 0 },
      daily: lastDays(day, 14).map((d) => ({ label: `${d.slice(5, 7)}.${d.slice(8)}`, value: 0 })),
      cuts: [],
      live: [],
      projects: [],
      ok: [],
      mine: [],
      backdrop: null,
      today,
    };
  }
  const projName = new Map(visible.map((p) => [p.id, p]));
  const liveAssets = and(inArray(assets.projectId, ids), isNull(assets.deletedAt));

  const days = lastDays(day, 14);
  const since = new Date(day.getTime() - 13 * 86400_000);
  const [statRows, dailyRows, cutRows, liveRows, cutStatusRows, projTakeRows, okRows, mineRows] = await Promise.all([
    db
      .select({
        todayTakes: sql<number>`count(*) filter (where ${assets.createdAt} >= ${day.toISOString()}::timestamptz and ${assets.source} = 'generated')::int`,
        monthTakes: sql<number>`count(*) filter (where ${assets.source} = 'generated')::int`,
        monthOk: sql<number>`count(*) filter (where ${assets.flag} = 'pick')::int`,
        monthNg: sql<number>`count(*) filter (where ${assets.flag} = 'reject')::int`,
        monthKeep: sql<number>`count(*) filter (where ${assets.flag} = 'keep')::int`,
      })
      .from(assets)
      .where(and(liveAssets, gte(assets.createdAt, month))),
    db
      .select({ d: sql<string>`to_char(${assets.createdAt} at time zone 'Asia/Seoul', 'YYYY-MM-DD')`, n: sql<number>`count(*)::int` })
      .from(assets)
      .where(and(liveAssets, eq(assets.source, "generated"), gte(assets.createdAt, since)))
      .groupBy(sql`1`),
    db
      .select({ c: cuts, assignee: user.name })
      .from(cuts)
      .leftJoin(user, eq(user.id, cuts.assigneeId))
      .where(and(inArray(cuts.projectId, ids), inArray(cuts.status, ["wip", "review"])))
      .orderBy(sql`(${cuts.assigneeId} = ${u.id}) desc nulls last`, desc(cuts.lastActivityAt))
      .limit(10),
    db
      .select({ userName: user.name, modelId: generations.modelId, kind: generations.kind, projectId: generations.projectId, cutId: generations.cutId, cutCode: cuts.code, since: generations.createdAt })
      .from(generations)
      .innerJoin(user, eq(user.id, generations.userId))
      .leftJoin(cuts, eq(cuts.id, generations.cutId))
      .where(and(inArray(generations.projectId, ids), inArray(generations.status, ACTIVE_STATUSES)))
      .orderBy(desc(generations.createdAt))
      .limit(40),
    db
      .select({ projectId: cuts.projectId, status: cuts.status, n: sql<number>`count(*)::int` })
      .from(cuts)
      .where(inArray(cuts.projectId, ids))
      .groupBy(cuts.projectId, cuts.status),
    db
      .select({ projectId: assets.projectId, takes: sql<number>`count(*)::int`, ok: sql<number>`count(*) filter (where ${assets.flag} = 'pick')::int` })
      .from(assets)
      .where(liveAssets)
      .groupBy(assets.projectId),
    db
      .select({ a: assets, userName: user.name, cutCode: cuts.code })
      .from(assets)
      .innerJoin(user, eq(user.id, assets.userId))
      .leftJoin(cuts, eq(cuts.id, assets.cutId))
      .where(and(liveAssets, eq(assets.flag, "pick")))
      .orderBy(desc(assets.updatedAt))
      .limit(8),
    db
      .select({ a: assets, userName: user.name, cutCode: cuts.code })
      .from(assets)
      .innerJoin(user, eq(user.id, assets.userId))
      .leftJoin(cuts, eq(cuts.id, assets.cutId))
      .where(and(eq(assets.userId, u.id), isNull(assets.deletedAt)))
      .orderBy(desc(assets.createdAt))
      .limit(10),
  ]);

  // 진행 중인 컷: 최근 테이크 몇 개와 지금 생성 중인 사람
  const cutIds = cutRows.map((r) => r.c.id);
  const [cutTakeRows, cutCounts] = cutIds.length
    ? await Promise.all([
        db
          .select({ a: assets })
          .from(assets)
          .where(and(inArray(assets.cutId, cutIds), isNull(assets.deletedAt)))
          .orderBy(desc(assets.createdAt))
          .limit(cutIds.length * 12),
        db
          .select({ cutId: assets.cutId, takes: sql<number>`count(*)::int`, ok: sql<number>`count(*) filter (where ${assets.flag} = 'pick')::int` })
          .from(assets)
          .where(and(inArray(assets.cutId, cutIds), isNull(assets.deletedAt)))
          .groupBy(assets.cutId),
      ])
    : [[], []];
  const countBy = new Map(cutCounts.map((r) => [r.cutId, r]));

  const toTake = async (r: { a: typeof assets.$inferSelect; userName: string; cutCode: string | null }): Promise<HomeTake> => {
    const urls = await assetUrls(r.a);
    return {
      id: r.a.id,
      kind: r.a.kind,
      width: r.a.width,
      height: r.a.height,
      durationSec: r.a.durationSec,
      take: r.a.take,
      flag: r.a.flag,
      prompt: r.a.prompt,
      projectId: r.a.projectId,
      projectName: projName.get(r.a.projectId)?.name ?? "",
      cutCode: r.cutCode,
      userName: r.userName,
      createdAt: r.a.createdAt.toISOString(),
      urls: { thumb: urls.thumb, src: urls.src },
    };
  };

  const [ok, mine, cutsOut] = await Promise.all([
    Promise.all(okRows.map(toTake)),
    Promise.all(mineRows.map(toTake)),
    Promise.all(
      cutRows.map(async ({ c, assignee }) => {
        const recentRows = cutTakeRows.filter((t) => t.a.cutId === c.id).slice(0, 5);
        const recent = await Promise.all(recentRows.map(async ({ a }) => ({ id: a.id, kind: a.kind, flag: a.flag, thumb: (await assetUrls(a)).thumb })));
        const counts = countBy.get(c.id);
        return {
          id: c.id,
          projectId: c.projectId,
          projectName: projName.get(c.projectId)?.name ?? "",
          projectColor: projName.get(c.projectId)?.color ?? null,
          code: c.code,
          title: c.title,
          status: c.status,
          assignee,
          mine: c.assigneeId === u.id,
          takes: counts?.takes ?? 0,
          ok: counts?.ok ?? 0,
          live: Array.from(new Set(liveRows.filter((l) => l.cutId === c.id).map((l) => l.userName))),
          recent,
          lastActivityAt: c.lastActivityAt.toISOString(),
        } satisfies HomeCut;
      }),
    ),
  ]);

  const cutStatus = new Map<string, Record<CutStatus, number>>();
  for (const r of cutStatusRows) {
    const m = cutStatus.get(r.projectId) ?? { todo: 0, wip: 0, review: 0, done: 0 };
    m[r.status] = r.n;
    cutStatus.set(r.projectId, m);
  }
  const takesBy = new Map(projTakeRows.map((r) => [r.projectId, r]));
  const activeCuts = cutStatusRows.filter((r) => r.status === "wip" || r.status === "review").reduce((s, r) => s + r.n, 0);
  const perDay = new Map(dailyRows.map((r) => [r.d, r.n]));

  return {
    stats: {
      activeCuts,
      todayTakes: statRows[0]?.todayTakes ?? 0,
      monthTakes: statRows[0]?.monthTakes ?? 0,
      monthOk: statRows[0]?.monthOk ?? 0,
      monthNg: statRows[0]?.monthNg ?? 0,
      monthKeep: statRows[0]?.monthKeep ?? 0,
      generating: liveRows.length,
    },
    daily: days.map((d) => ({ label: `${d.slice(5, 7)}.${d.slice(8)}`, value: perDay.get(d) ?? 0 })),
    cuts: cutsOut,
    live: liveRows.slice(0, 8).map((l) => ({
      userName: l.userName,
      modelId: l.modelId,
      kind: l.kind,
      projectName: projName.get(l.projectId)?.name ?? "",
      cutCode: l.cutCode,
      since: l.since.toISOString(),
    })),
    projects: visible
      .filter((p) => !p.isPersonal)
      .slice(0, 6)
      .map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        isPersonal: p.isPersonal,
        lastActivityAt: p.lastActivityAt.toISOString(),
        cuts: cutStatus.get(p.id) ?? { todo: 0, wip: 0, review: 0, done: 0 },
        takes: takesBy.get(p.id)?.takes ?? 0,
        ok: takesBy.get(p.id)?.ok ?? 0,
      })),
    ok,
    mine,
    backdrop: ok.find((t) => t.kind === "image")?.urls.thumb ?? mine.find((t) => t.kind === "image")?.urls.thumb ?? null,
    today,
  };
}
