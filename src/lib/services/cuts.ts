import "server-only";

import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { nextCutCodes, normalizeCutCode, ratioLabel } from "@/lib/cuts";
import { db } from "@/lib/db";
import { assets, cuts, generations, projects, teams, user } from "@/lib/db/schema";
import { badRequest, forbidden, notFound } from "@/lib/errors";
import { MODEL_SLUG } from "@/lib/models/registry";
import { formatTake, renderFilename, sanitizeSegment, withVerdict } from "@/lib/naming";
import { atLeast, getProjectAccess, requireProject, type AccessLevel } from "@/lib/services/access";
import { assetUrls, nextTake, refreshSearchText, type AssetRow } from "@/lib/services/assets";
import { audit } from "@/lib/services/audit";
import { getSettings } from "@/lib/services/settings";
import type { CurrentUser } from "@/lib/session";
import { ACTIVE_STATUSES, FLAG_LABEL, type CutStatus, type Flag } from "@/lib/types";

export type CutRow = typeof cuts.$inferSelect;

export type CutTake = {
  id: string;
  kind: "image" | "video";
  take: number | null;
  flag: Flag | null;
  durationSec: number | null;
  userName: string;
  createdAt: string;
  urls: { thumb: string; src: string };
};

export type CutCounts = { takes: number; ok: number; ng: number; keep: number };

export type CutDTO = {
  id: string;
  projectId: string;
  code: string;
  title: string | null;
  note: string | null;
  status: CutStatus;
  position: number;
  assignee: { id: string; name: string; image: string | null } | null;
  counts: CutCounts;
  cover: CutTake | null;
  recent: CutTake[];
  /** 지금 이 컷에서 생성 중인 사람 */
  active: { id: string; name: string }[];
  lastActivityAt: string;
};

export type CutBoard = {
  cuts: CutDTO[];
  /** 컷에 안 들어간 클립 */
  loose: { counts: CutCounts; recent: CutTake[] };
  level: AccessLevel;
};

const RECENT_PER_CUT = 8;
const EMPTY: CutCounts = { takes: 0, ok: 0, ng: 0, keep: 0 };

/* ---------------------------------- 권한 ---------------------------------- */

export async function requireCut(u: CurrentUser, cutId: string, min: AccessLevel) {
  const [cut] = await db.select().from(cuts).where(eq(cuts.id, cutId));
  if (!cut) throw notFound("컷을 찾을 수 없어요.");
  const { project, level } = await getProjectAccess(u, cut.projectId);
  if (!project || level === "none") throw notFound("컷을 찾을 수 없어요.");
  if (!atLeast(level, min)) throw forbidden("이 컷을 바꿀 권한이 없어요.");
  return { cut, project, level };
}

/* ---------------------------------- 목록 ---------------------------------- */

type TakeRow = { a: AssetRow; userName: string };

async function toTakes(rows: TakeRow[]): Promise<CutTake[]> {
  return Promise.all(
    rows.map(async ({ a, userName }) => {
      const urls = await assetUrls(a);
      return {
        id: a.id,
        kind: a.kind,
        take: a.take,
        flag: a.flag,
        durationSec: a.durationSec,
        userName,
        createdAt: a.createdAt.toISOString(),
        urls: { thumb: urls.thumb, src: urls.src },
      };
    }),
  );
}

/** 프로젝트의 컷 보드: 컷마다 판정 개수 · 최근 테이크 · 대표 · 담당 · 지금 생성 중인 사람 */
export async function cutBoard(u: CurrentUser, projectId: string): Promise<CutBoard> {
  const { level } = await requireProject(u, projectId, "viewer");
  const rows = await db
    .select({ c: cuts, assigneeName: user.name, assigneeImage: user.image })
    .from(cuts)
    .leftJoin(user, eq(user.id, cuts.assigneeId))
    .where(eq(cuts.projectId, projectId))
    .orderBy(asc(cuts.position), asc(cuts.createdAt));

  const live = and(eq(assets.projectId, projectId), isNull(assets.deletedAt));
  const countRows = await db
    .select({
      cutId: assets.cutId,
      takes: sql<number>`count(*)::int`,
      ok: sql<number>`count(*) filter (where ${assets.flag} = 'pick')::int`,
      ng: sql<number>`count(*) filter (where ${assets.flag} = 'reject')::int`,
      keep: sql<number>`count(*) filter (where ${assets.flag} = 'keep')::int`,
    })
    .from(assets)
    .where(live)
    .groupBy(assets.cutId);
  const counts = new Map(countRows.map((r) => [r.cutId ?? "", { takes: r.takes, ok: r.ok, ng: r.ng, keep: r.keep }]));

  // 컷마다 최근 테이크 몇 개 (컷 없는 클립 포함)
  const ranked = db.$with("ranked").as(
    db
      .select({
        id: assets.id,
        rn: sql<number>`row_number() over (partition by ${assets.cutId} order by ${assets.createdAt} desc)`.as("rn"),
      })
      .from(assets)
      .where(live),
  );
  const recentRows = await db
    .with(ranked)
    .select({ a: assets, userName: user.name })
    .from(ranked)
    .innerJoin(assets, eq(assets.id, ranked.id))
    .innerJoin(user, eq(user.id, assets.userId))
    .where(sql`${ranked.rn} <= ${RECENT_PER_CUT}`)
    .orderBy(desc(assets.createdAt));

  // 대표: 지정한 것 → 마지막 OK → 가장 최근
  const coverIds = rows.map((r) => r.c.coverAssetId).filter(Boolean) as string[];
  const okRows = await db
    .selectDistinctOn([assets.cutId], { a: assets, userName: user.name })
    .from(assets)
    .innerJoin(user, eq(user.id, assets.userId))
    .where(and(live, eq(assets.flag, "pick")))
    .orderBy(assets.cutId, desc(assets.createdAt));
  const pinnedRows = coverIds.length
    ? await db
        .select({ a: assets, userName: user.name })
        .from(assets)
        .innerJoin(user, eq(user.id, assets.userId))
        .where(and(inArray(assets.id, coverIds), isNull(assets.deletedAt)))
    : [];

  const [recentTakes, okTakes, pinnedTakes] = await Promise.all([toTakes(recentRows), toTakes(okRows), toTakes(pinnedRows)]);
  const recentBy = new Map<string, CutTake[]>();
  recentRows.forEach((r, i) => {
    const key = r.a.cutId ?? "";
    recentBy.set(key, [...(recentBy.get(key) ?? []), recentTakes[i]]);
  });
  const okBy = new Map(okRows.map((r, i) => [r.a.cutId ?? "", okTakes[i]]));
  const pinnedBy = new Map(pinnedRows.map((r, i) => [r.a.id, pinnedTakes[i]]));

  // 지금 생성 중인 사람
  const cutIds = rows.map((r) => r.c.id);
  const activeRows = cutIds.length
    ? await db
        .selectDistinct({ cutId: generations.cutId, id: user.id, name: user.name })
        .from(generations)
        .innerJoin(user, eq(user.id, generations.userId))
        .where(and(inArray(generations.cutId, cutIds), inArray(generations.status, ACTIVE_STATUSES)))
    : [];

  return {
    level,
    cuts: rows.map(({ c, assigneeName, assigneeImage }) => {
      const recent = recentBy.get(c.id) ?? [];
      return {
        id: c.id,
        projectId: c.projectId,
        code: c.code,
        title: c.title,
        note: c.note,
        status: c.status,
        position: c.position,
        assignee: c.assigneeId && assigneeName ? { id: c.assigneeId, name: assigneeName, image: assigneeImage } : null,
        counts: counts.get(c.id) ?? EMPTY,
        cover: (c.coverAssetId && pinnedBy.get(c.coverAssetId)) || okBy.get(c.id) || recent[0] || null,
        recent,
        active: activeRows.filter((a) => a.cutId === c.id).map((a) => ({ id: a.id, name: a.name })),
        lastActivityAt: c.lastActivityAt.toISOString(),
      };
    }),
    loose: { counts: counts.get("") ?? EMPTY, recent: recentBy.get("") ?? [] },
  };
}

/** 스튜디오 컷 선택용 가벼운 목록 */
export async function cutOptions(u: CurrentUser, projectId: string) {
  await requireProject(u, projectId, "viewer");
  return db
    .select({ id: cuts.id, code: cuts.code, title: cuts.title, status: cuts.status })
    .from(cuts)
    .where(eq(cuts.projectId, projectId))
    .orderBy(asc(cuts.position), asc(cuts.createdAt));
}

/* ---------------------------------- 만들기·고치기 ---------------------------------- */

export async function createCuts(u: CurrentUser, projectId: string, input: { code?: string | null; title?: string | null; count?: number }) {
  await requireProject(u, projectId, "editor");
  const existing = await db
    .select({ code: cuts.code, position: cuts.position })
    .from(cuts)
    .where(eq(cuts.projectId, projectId))
    .orderBy(asc(cuts.position), asc(cuts.createdAt));
  const count = Math.max(1, Math.min(200, Math.round(input.count ?? 1)));
  let codes: string[];
  if (input.code?.trim()) {
    const code = normalizeCutCode(input.code);
    if (!code) throw badRequest("컷 번호를 적어 주세요.");
    if (existing.some((c) => c.code.toUpperCase() === code)) throw badRequest(`${code}는 이미 있는 컷 번호예요.`);
    codes = count > 1 ? [code, ...nextCutCodes([...existing.map((c) => c.code), code], count - 1)] : [code];
  } else {
    codes = nextCutCodes(
      existing.map((c) => c.code),
      count,
    );
  }
  const start = (existing.at(-1)?.position ?? -1) + 1;
  const title = input.title?.trim().slice(0, 80) || null;
  const rows = await db
    .insert(cuts)
    .values(codes.map((code, i) => ({ projectId, code, title: count === 1 ? title : null, position: start + i, createdBy: u.id })))
    .onConflictDoNothing()
    .returning();
  await db.update(projects).set({ lastActivityAt: new Date() }).where(eq(projects.id, projectId));
  await audit(u.id, "cut.create", { type: "project", id: projectId }, { codes });
  return rows;
}

export async function updateCut(
  u: CurrentUser,
  cutId: string,
  patch: { code?: string; title?: string | null; note?: string | null; status?: CutStatus; assigneeId?: string | null; coverAssetId?: string | null },
) {
  const { cut } = await requireCut(u, cutId, "editor");
  const set: Partial<typeof cuts.$inferInsert> = {};
  if (patch.code !== undefined) {
    const code = normalizeCutCode(patch.code);
    if (!code) throw badRequest("컷 번호를 적어 주세요.");
    if (code !== cut.code) {
      const [dup] = await db
        .select({ id: cuts.id })
        .from(cuts)
        .where(and(eq(cuts.projectId, cut.projectId), sql`upper(${cuts.code}) = ${code}`));
      if (dup) throw badRequest(`${code}는 이미 있는 컷 번호예요.`);
      set.code = code;
    }
  }
  if (patch.title !== undefined) set.title = patch.title?.trim().slice(0, 80) || null;
  if (patch.note !== undefined) set.note = patch.note?.trim().slice(0, 2000) || null;
  if (patch.status) set.status = patch.status;
  if (patch.assigneeId !== undefined) {
    if (patch.assigneeId) {
      const [who] = await db.select({ id: user.id }).from(user).where(and(eq(user.id, patch.assigneeId), eq(user.status, "active")));
      if (!who) throw badRequest("담당자를 찾을 수 없어요.");
    }
    set.assigneeId = patch.assigneeId;
  }
  if (patch.coverAssetId !== undefined) {
    if (patch.coverAssetId) {
      const [a] = await db.select({ cutId: assets.cutId }).from(assets).where(eq(assets.id, patch.coverAssetId));
      if (a?.cutId !== cut.id) throw badRequest("이 컷의 테이크만 대표로 정할 수 있어요.");
    }
    set.coverAssetId = patch.coverAssetId;
  }
  if (!Object.keys(set).length) return cut;
  const [row] = await db.update(cuts).set(set).where(eq(cuts.id, cutId)).returning();
  if (set.code) await renameCutAssets(cutId);
  return row;
}

export async function reorderCuts(u: CurrentUser, projectId: string, ids: string[]) {
  await requireProject(u, projectId, "editor");
  const own = await db.select({ id: cuts.id }).from(cuts).where(eq(cuts.projectId, projectId));
  const valid = new Set(own.map((c) => c.id));
  const ordered = ids.filter((id) => valid.has(id));
  await db.transaction(async (tx) => {
    for (const [i, id] of ordered.entries()) await tx.update(cuts).set({ position: i }).where(eq(cuts.id, id));
  });
}

/** 컷 삭제: 클립은 지우지 않고 "컷 없음"으로 돌아가요 */
export async function deleteCut(u: CurrentUser, cutId: string) {
  const { cut } = await requireCut(u, cutId, "editor");
  const moved = await db.select({ id: assets.id }).from(assets).where(eq(assets.cutId, cutId));
  await db.update(assets).set({ cutId: null, take: null }).where(eq(assets.cutId, cutId));
  await db.update(generations).set({ cutId: null }).where(eq(generations.cutId, cutId));
  await db.delete(cuts).where(eq(cuts.id, cutId));
  await renameAssets(moved.map((m) => m.id));
  await audit(u.id, "cut.delete", { type: "project", id: cut.projectId }, { code: cut.code });
}

/* ---------------------------------- 테이크 ---------------------------------- */

/** 생성 요청에 붙은 컷이 이 프로젝트 것인지 확인 */
export async function assertCutInProject(cutId: string, projectId: string) {
  const [c] = await db.select({ projectId: cuts.projectId }).from(cuts).where(eq(cuts.id, cutId));
  if (!c || c.projectId !== projectId) throw badRequest("선택한 컷이 이 프로젝트에 없어요.");
}

/**
 * 클립을 컷으로 옮기기 (cutId = null이면 컷에서 빼기).
 * 다른 프로젝트의 컷이면 프로젝트도 함께 옮겨요. 옮긴 클립은 새 테이크 번호를 받아요.
 */
export async function moveAssetsToCut(u: CurrentUser, assetIds: string[], cutId: string | null) {
  const ids = Array.from(new Set(assetIds)).slice(0, 500);
  if (!ids.length) return { moved: 0 };
  const rows = await db.select().from(assets).where(inArray(assets.id, ids)).orderBy(asc(assets.createdAt));
  if (rows.length !== ids.length) throw badRequest("일부 파일을 찾을 수 없어요.");
  // 원래 프로젝트 편집 권한
  for (const pid of new Set(rows.map((r) => r.projectId))) await requireProject(u, pid, "editor");
  let target: CutRow | null = null;
  if (cutId) {
    target = (await requireCut(u, cutId, "editor")).cut;
  }
  for (const a of rows) {
    if (target && a.cutId === target.id) continue;
    if (!target && !a.cutId) continue;
    const take = target ? await nextTake(target.id) : null;
    await db
      .update(assets)
      .set({ cutId: target?.id ?? null, take, ...(target && target.projectId !== a.projectId ? { projectId: target.projectId } : {}) })
      .where(eq(assets.id, a.id));
  }
  await renameAssets(ids);
  await refreshSearchText(ids);
  await audit(u.id, "assets.move_cut", null, { count: ids.length, cutId });
  return { moved: ids.length };
}

/* ---------------------------------- 파일 이름 ---------------------------------- */

/** 컷 번호가 바뀐 뒤 그 컷 클립들의 이름 다시 짓기 */
async function renameCutAssets(cutId: string) {
  const rows = await db.select({ id: assets.id }).from(assets).where(eq(assets.cutId, cutId));
  await renameAssets(rows.map((r) => r.id));
}

/**
 * 컷·테이크가 바뀐 클립의 파일 이름을 다시 지어요.
 * 만든 결과물은 파일명 규칙을 다시 적용하고, 올린 파일은 원래 이름 앞의 컷 표시만 바꿔요.
 */
export async function renameAssets(ids: string[]) {
  if (!ids.length) return;
  const settings = await getSettings();
  const rows = await db
    .select({
      a: assets,
      projectName: projects.name,
      isPersonal: projects.isPersonal,
      teamName: teams.name,
      creator: user.name,
      cutCode: cuts.code,
      params: generations.params,
    })
    .from(assets)
    .innerJoin(projects, eq(projects.id, assets.projectId))
    .innerJoin(user, eq(user.id, assets.userId))
    .leftJoin(teams, eq(teams.id, projects.teamId))
    .leftJoin(cuts, eq(cuts.id, assets.cutId))
    .leftJoin(generations, eq(generations.id, assets.generationId))
    .where(inArray(assets.id, ids));
  for (const r of rows) {
    const a = r.a;
    const ext = a.filename.match(/\.([^.]+)$/)?.[1] ?? (a.kind === "video" ? "mp4" : "png");
    let filename: string;
    if (a.source === "upload") {
      const bare = a.filename.replace(/^\[[^\]]*\]_/, "");
      filename = r.cutCode && a.take ? `[${sanitizeSegment(r.cutCode)}_${formatTake(a.take)}]_${bare}` : bare;
    } else {
      const params = (r.params ?? {}) as Record<string, unknown>;
      filename = renderFilename(settings.filenameTemplate, {
        project: r.isPersonal ? `${r.creator}-개인` : r.projectName,
        cut: r.cutCode,
        take: a.take,
        team: r.teamName,
        user: r.creator,
        model: a.modelId ? MODEL_SLUG[a.modelId] ?? a.modelId : a.kind,
        kind: a.kind,
        date: a.createdAt,
        seq: a.seq,
        prompt: a.prompt,
        ratio: typeof params.aspectRatio === "string" ? params.aspectRatio : ratioLabel(a.width, a.height),
        res: typeof params.resolution === "string" ? params.resolution : null,
        index: a.outputIndex,
        ext,
      });
    }
    if (filename !== a.filename) await db.update(assets).set({ filename }).where(eq(assets.id, a.id));
  }
}

/* ---------------------------------- 내보내기 ---------------------------------- */

export type ExportFile = { path: string; url: string; sizeBytes: number | null };

/**
 * 컷(또는 프로젝트 전체) 내보내기 목록: 폴더 = 프로젝트/컷, 파일 이름 끝에 판정(OK·NG·KEEP).
 * 샷 리스트 CSV를 함께 돌려줘요. 실제 압축은 브라우저에서 해요(서버 전송량 없음).
 */
export async function exportList(
  u: CurrentUser,
  input: { projectId: string; cutId?: string | null; verdicts?: (Flag | "none")[] },
): Promise<{ zipName: string; files: ExportFile[]; csv: string }> {
  const { project } = await requireProject(u, input.projectId, "viewer");
  const conds = [eq(assets.projectId, project.id), isNull(assets.deletedAt)];
  if (input.cutId) conds.push(eq(assets.cutId, input.cutId));
  const rows = await db
    .select({ a: assets, cutCode: cuts.code, cutTitle: cuts.title, cutPos: cuts.position, creator: user.name })
    .from(assets)
    .innerJoin(user, eq(user.id, assets.userId))
    .leftJoin(cuts, eq(cuts.id, assets.cutId))
    .where(and(...conds))
    .orderBy(asc(cuts.position), asc(assets.take), asc(assets.createdAt));
  const verdicts = input.verdicts?.length ? new Set(input.verdicts) : null;
  const picked = rows.filter((r) => !verdicts || verdicts.has(r.a.flag ?? "none"));
  if (picked.length > 400) throw badRequest("한 번에 400개까지 내보낼 수 있어요. 판정이나 컷으로 좁혀 주세요.");

  const root = sanitizeSegment(project.name) || "project";
  const files: ExportFile[] = [];
  const lines = [["cut", "cut_title", "take", "verdict", "file", "kind", "model", "author", "created_at", "prompt"].join(",")];
  for (const r of picked) {
    const verdict = r.a.flag ? FLAG_LABEL[r.a.flag] : null;
    const folder = r.cutCode ? sanitizeSegment(r.cutCode) : "_컷없음";
    const name = withVerdict(r.a.filename, verdict);
    const urls = await assetUrls({ ...r.a, filename: name });
    files.push({ path: `${root}/${folder}/${name}`, url: urls.download, sizeBytes: r.a.sizeBytes });
    lines.push(
      [r.cutCode ?? "", r.cutTitle ?? "", r.a.take ? formatTake(r.a.take) : "", verdict ?? "", name, r.a.kind, r.a.modelId ?? "", r.creator, r.a.createdAt.toISOString(), r.a.prompt]
        .map(csvCell)
        .join(","),
    );
  }
  const cutPart = input.cutId ? `_${sanitizeSegment(rows[0]?.cutCode ?? "cut")}` : "";
  return { zipName: `${root}${cutPart}.zip`, files, csv: "﻿" + lines.join("\n") };
}

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}
