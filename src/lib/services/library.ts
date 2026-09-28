import "server-only";

import { and, asc, desc, eq, exists, gte, ilike, inArray, isNotNull, isNull, lt, not, or, sql, type SQL } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  assets,
  assetTags,
  collectionItems,
  cuts,
  favorites,
  generations,
  projects,
  tags,
  teams,
  user,
} from "@/lib/db/schema";
import { parseQuery } from "@/lib/search/query";
import { visibleProjectsWhere } from "@/lib/services/access";
import { assetUrls, type AssetUrls } from "@/lib/services/assets";
import type { CurrentUser } from "@/lib/session";
import type { ColorLabel, Flag } from "@/lib/types";

export type AssetFilters = {
  q?: string;
  projectId?: string;
  collectionId?: string;
  kind?: "image" | "video";
  models?: string[];
  minRating?: number;
  flags?: (Flag | "none")[];
  /** 컷 id, 또는 "none" = 컷 없는 클립 */
  cutId?: string;
  colors?: ColorLabel[];
  tags?: string[];
  mine?: boolean;
  favorites?: boolean;
  trash?: boolean;
  sort?: "newest" | "oldest" | "rating" | "relevance";
  offset?: number;
  limit?: number;
};

export type AssetListItem = {
  id: string;
  kind: "image" | "video";
  source: "generated" | "upload";
  filename: string;
  width: number | null;
  height: number | null;
  durationSec: number | null;
  sizeBytes: number | null;
  rating: number;
  flag: Flag | null;
  colorLabel: ColorLabel | null;
  prompt: string;
  modelId: string | null;
  projectId: string;
  projectName: string;
  cutId: string | null;
  cutCode: string | null;
  take: number | null;
  userId: string;
  userName: string;
  generationId: string | null;
  createdAt: string;
  isFavorite: boolean;
  tags: string[];
  urls: AssetUrls;
};

function like(term: string) {
  return `%${term.replace(/[\\%_]/g, (m) => "\\" + m)}%`;
}

export async function searchAssets(u: CurrentUser, f: AssetFilters) {
  const pq = parseQuery(f.q ?? "");
  const conds: (SQL | undefined)[] = [];

  // 접근 가능한 프로젝트만
  conds.push(visibleProjectsWhere(u));
  if (f.trash) {
    conds.push(isNotNull(assets.deletedAt));
    if (u.role !== "admin") conds.push(eq(assets.userId, u.id));
  } else {
    conds.push(isNull(assets.deletedAt));
  }
  if (f.projectId) conds.push(eq(assets.projectId, f.projectId));
  else conds.push(isNull(projects.archivedAt));
  if (f.cutId === "none") conds.push(isNull(assets.cutId));
  else if (f.cutId) conds.push(eq(assets.cutId, f.cutId));
  if (pq.cuts.length) conds.push(or(...pq.cuts.map((c) => sql`upper(${cuts.code}) = ${c}`)));
  if (f.collectionId) {
    conds.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(collectionItems)
          .where(and(eq(collectionItems.collectionId, f.collectionId), eq(collectionItems.assetId, assets.id))),
      ),
    );
  }

  const kind = f.kind ?? pq.kind;
  if (kind) conds.push(eq(assets.kind, kind));
  if (pq.source) conds.push(eq(assets.source, pq.source));
  const models = [...(f.models ?? []), ...pq.models];
  if (models.length) conds.push(inArray(assets.modelId, models));
  const minRating = Math.max(f.minRating ?? 0, pq.minRating ?? 0);
  if (minRating > 0) conds.push(gte(assets.rating, minRating));
  if (pq.exactRating !== undefined) conds.push(eq(assets.rating, pq.exactRating));
  if (pq.unrated) conds.push(eq(assets.rating, 0));
  const flags = [...(f.flags ?? []), ...pq.flags];
  if (flags.length) {
    const fc: SQL[] = [];
    if (flags.includes("pick")) fc.push(eq(assets.flag, "pick"));
    if (flags.includes("reject")) fc.push(eq(assets.flag, "reject"));
    if (flags.includes("keep")) fc.push(eq(assets.flag, "keep"));
    if (flags.includes("none")) fc.push(isNull(assets.flag));
    conds.push(or(...fc));
  }
  const colors = [...(f.colors ?? []), ...pq.colors];
  if (colors.length) conds.push(inArray(assets.colorLabel, colors));
  if (f.mine) conds.push(eq(assets.userId, u.id));
  if (f.favorites || pq.favorite) {
    conds.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(favorites)
          .where(and(eq(favorites.userId, u.id), eq(favorites.assetId, assets.id))),
      ),
    );
  }
  for (const t of [...(f.tags ?? []), ...pq.tags]) {
    conds.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(assetTags)
          .innerJoin(tags, eq(tags.id, assetTags.tagId))
          .where(and(eq(assetTags.assetId, assets.id), ilike(tags.name, like(t.toLowerCase())))),
      ),
    );
  }
  for (const name of pq.users) {
    // @나 · @me → 내가 만든 것
    if (name === "나" || name.toLowerCase() === "me") conds.push(eq(assets.userId, u.id));
    else conds.push(or(ilike(user.name, like(name)), ilike(user.email, like(name))));
  }
  for (const name of pq.teams) conds.push(ilike(teams.name, like(name)));
  for (const name of pq.projects) conds.push(ilike(projects.name, like(name)));
  if (pq.after) conds.push(gte(assets.createdAt, pq.after));
  if (pq.before) conds.push(lt(assets.createdAt, pq.before));
  if (pq.ratio) {
    const [a, b] = pq.ratio.split(/[:x]/).map(Number);
    if (a && b) {
      conds.push(
        sql`${assets.width} is not null and ${assets.height} > 0 and abs((${assets.width}::float / ${assets.height}) - ${a / b}) < 0.03`,
      );
    }
  }
  // 자유 검색어: 동의어 그룹은 OR, 그룹끼리는 AND
  for (const group of pq.terms) {
    conds.push(or(...group.map((t) => or(ilike(assets.searchText, like(t)), ilike(projects.name, like(t))))));
  }
  for (const phrase of pq.phrases) conds.push(ilike(assets.searchText, like(phrase)));
  for (const ex of pq.excludes) conds.push(not(ilike(assets.searchText, like(ex))));

  const where = and(...conds.filter(Boolean));
  const limit = Math.min(120, Math.max(1, f.limit ?? 60));
  const offset = Math.max(0, f.offset ?? 0);
  const textQuery = pq.terms.map((g) => g[0]).join(" ");

  const order =
    f.sort === "oldest"
      ? [asc(assets.createdAt), asc(assets.id)]
      : f.sort === "rating"
        ? [desc(assets.rating), desc(assets.createdAt)]
        : f.sort === "relevance" && textQuery
          ? [desc(sql`similarity(${assets.searchText}, ${textQuery})`), desc(assets.createdAt)]
          : [desc(assets.createdAt), desc(assets.id)];

  const rows = await db
    .select({
      a: assets,
      projectName: projects.name,
      userName: user.name,
      cutCode: cuts.code,
      isFavorite: sql<boolean>`exists(select 1 from ${favorites} where ${favorites.userId} = ${u.id} and ${favorites.assetId} = ${assets.id})`,
    })
    .from(assets)
    .innerJoin(projects, eq(projects.id, assets.projectId))
    .innerJoin(user, eq(user.id, assets.userId))
    .leftJoin(teams, eq(teams.id, assets.teamId))
    .leftJoin(cuts, eq(cuts.id, assets.cutId))
    .where(where)
    .orderBy(...order)
    .limit(limit + 1)
    .offset(offset);

  const page = rows.slice(0, limit);
  const items = await toListItems(page);
  return { items, nextOffset: rows.length > limit ? offset + limit : null, parsed: pq };
}

type Row = { a: typeof assets.$inferSelect; projectName: string; userName: string; isFavorite: boolean; cutCode?: string | null };

export async function toListItems(rows: Row[]): Promise<AssetListItem[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.a.id);
  const tagRows = await db
    .select({ assetId: assetTags.assetId, name: tags.name })
    .from(assetTags)
    .innerJoin(tags, eq(tags.id, assetTags.tagId))
    .where(inArray(assetTags.assetId, ids));
  return Promise.all(
    rows.map(async ({ a, projectName, userName, isFavorite, cutCode }) => ({
      id: a.id,
      kind: a.kind,
      source: a.source,
      filename: a.filename,
      width: a.width,
      height: a.height,
      durationSec: a.durationSec,
      sizeBytes: a.sizeBytes,
      rating: a.rating,
      flag: a.flag,
      colorLabel: a.colorLabel,
      prompt: a.prompt,
      modelId: a.modelId,
      projectId: a.projectId,
      projectName,
      cutId: a.cutId,
      cutCode: cutCode ?? null,
      take: a.take,
      userId: a.userId,
      userName,
      generationId: a.generationId,
      createdAt: a.createdAt.toISOString(),
      isFavorite: !!isFavorite,
      tags: tagRows.filter((t) => t.assetId === a.id).map((t) => t.name),
      urls: await assetUrls(a),
    })),
  );
}

/** 에셋 상세 (생성 설정·입력 포함) */
export async function assetDetail(u: CurrentUser, id: string) {
  const rows = await db
    .select({
      a: assets,
      projectName: projects.name,
      userName: user.name,
      cutCode: cuts.code,
      isFavorite: sql<boolean>`exists(select 1 from ${favorites} where ${favorites.userId} = ${u.id} and ${favorites.assetId} = ${assets.id})`,
    })
    .from(assets)
    .innerJoin(projects, eq(projects.id, assets.projectId))
    .innerJoin(user, eq(user.id, assets.userId))
    .leftJoin(cuts, eq(cuts.id, assets.cutId))
    .where(and(eq(assets.id, id), visibleProjectsWhere(u)))
    .limit(1);
  if (!rows[0]) return null;
  const [item] = await toListItems(rows);
  let generation: null | {
    id: string;
    modelId: string;
    workflow: string;
    params: Record<string, unknown>;
    inputs: Record<string, unknown>;
    prompt: string;
    costMicros: number | null;
    estimatedCostMicros: number;
    isDraft: boolean;
    createdAt: string;
    completedAt: string | null;
    inputAssets: { id: string; role: string; kind: string; thumb: string }[];
  } = null;
  if (rows[0].a.generationId) {
    const [g] = await db.select().from(generations).where(eq(generations.id, rows[0].a.generationId));
    if (g) {
      const roles: { id: string; role: string }[] = [
        ...(g.inputs.startFrame ? [{ id: g.inputs.startFrame, role: "시작 프레임" }] : []),
        ...(g.inputs.endFrame ? [{ id: g.inputs.endFrame, role: "끝 프레임" }] : []),
        ...(g.inputs.images ?? []).map((x) => ({ id: x, role: "이미지 레퍼런스" })),
        ...(g.inputs.videos ?? []).map((x) => ({ id: x, role: "영상" })),
      ];
      const inputRows = roles.length
        ? await db.select().from(assets).where(inArray(assets.id, roles.map((r) => r.id)))
        : [];
      const inputAssets = await Promise.all(
        roles
          .map((r) => ({ r, a: inputRows.find((x) => x.id === r.id) }))
          .filter((x) => x.a)
          .map(async ({ r, a }) => ({ id: a!.id, role: r.role, kind: a!.kind, thumb: (await assetUrls(a!)).thumb })),
      );
      generation = {
        id: g.id,
        modelId: g.modelId,
        workflow: g.workflow,
        params: g.params,
        inputs: g.inputs,
        prompt: g.prompt,
        costMicros: g.costMicros,
        estimatedCostMicros: g.estimatedCostMicros,
        isDraft: g.isDraft,
        createdAt: g.createdAt.toISOString(),
        completedAt: g.completedAt?.toISOString() ?? null,
        inputAssets,
      };
    }
  }
  return { ...item, generation };
}
