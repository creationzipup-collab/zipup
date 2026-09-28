import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { assets, assetTags, favorites, projectMembers, projects, tags } from "@/lib/db/schema";
import { badRequest, forbidden } from "@/lib/errors";
import { atLeast, computeAccess, requireProject, type AccessLevel } from "@/lib/services/access";
import { refreshSearchText } from "@/lib/services/assets";
import { audit } from "@/lib/services/audit";
import type { CurrentUser } from "@/lib/session";
import type { ColorLabel, Flag } from "@/lib/types";

export type AssetPatch = {
  rating?: number;
  flag?: Flag | null;
  colorLabel?: ColorLabel | null;
  addTags?: string[];
  removeTags?: string[];
  favorite?: boolean;
  projectId?: string;
  deleted?: boolean;
  prompt?: never;
};

/** 에셋별 접근 수준 */
export async function assetAccess(u: CurrentUser, ids: string[]) {
  const rows = await db
    .select({ a: assets, p: projects, memberRole: projectMembers.role })
    .from(assets)
    .innerJoin(projects, eq(projects.id, assets.projectId))
    .leftJoin(projectMembers, and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, u.id)))
    .where(inArray(assets.id, ids));
  return rows.map((r) => ({ asset: r.a, level: computeAccess(u, r.p, r.memberRole ?? null) as AccessLevel }));
}

export function normalizeTag(t: string): string {
  return t.replace(/^#/, "").trim().toLowerCase().replace(/\s+/g, "-").slice(0, 40);
}

export async function updateAssets(u: CurrentUser, ids: string[], patch: AssetPatch) {
  const unique = Array.from(new Set(ids)).slice(0, 500);
  if (!unique.length) return { updated: 0 };
  const access = await assetAccess(u, unique);
  if (access.length !== unique.length) throw badRequest("일부 파일을 찾을 수 없어요.");
  const needsEdit =
    patch.rating !== undefined ||
    patch.flag !== undefined ||
    patch.colorLabel !== undefined ||
    !!patch.addTags?.length ||
    !!patch.removeTags?.length ||
    patch.projectId !== undefined ||
    patch.deleted !== undefined;
  for (const a of access) {
    const min: AccessLevel = needsEdit ? "editor" : "viewer";
    if (!atLeast(a.level, min)) throw forbidden("편집 권한이 없는 파일이 포함돼 있어요.");
  }

  const set: Partial<typeof assets.$inferInsert> = {};
  if (patch.rating !== undefined) set.rating = Math.max(0, Math.min(5, Math.round(patch.rating)));
  if (patch.flag !== undefined) set.flag = patch.flag;
  if (patch.colorLabel !== undefined) set.colorLabel = patch.colorLabel;
  if (patch.deleted !== undefined) set.deletedAt = patch.deleted ? new Date() : null;
  if (patch.projectId) {
    const { project } = await requireProject(u, patch.projectId, "editor");
    set.projectId = project.id;
    // 컷은 프로젝트 안의 것이라 다른 프로젝트로 옮기면 컷에서 빠져요
    set.cutId = null;
    set.take = null;
  }
  if (Object.keys(set).length) {
    await db.update(assets).set(set).where(inArray(assets.id, unique));
  }

  let touchedSearch = !!patch.projectId;
  if (patch.addTags?.length) {
    const names = Array.from(new Set(patch.addTags.map(normalizeTag).filter(Boolean))).slice(0, 20);
    if (names.length) {
      await db
        .insert(tags)
        .values(names.map((name) => ({ name, createdBy: u.id })))
        .onConflictDoNothing();
      const tagRows = await db.select().from(tags).where(inArray(tags.name, names));
      const values = unique.flatMap((assetId) => tagRows.map((t) => ({ assetId, tagId: t.id, createdBy: u.id })));
      if (values.length) await db.insert(assetTags).values(values).onConflictDoNothing();
      touchedSearch = true;
    }
  }
  if (patch.removeTags?.length) {
    const names = patch.removeTags.map(normalizeTag);
    const tagRows = await db.select().from(tags).where(inArray(tags.name, names));
    if (tagRows.length) {
      await db
        .delete(assetTags)
        .where(and(inArray(assetTags.assetId, unique), inArray(assetTags.tagId, tagRows.map((t) => t.id))));
      touchedSearch = true;
    }
  }
  if (patch.favorite !== undefined) {
    if (patch.favorite) {
      await db
        .insert(favorites)
        .values(unique.map((assetId) => ({ userId: u.id, assetId })))
        .onConflictDoNothing();
    } else {
      await db.delete(favorites).where(and(eq(favorites.userId, u.id), inArray(favorites.assetId, unique)));
    }
  }
  if (patch.projectId) {
    const { renameAssets } = await import("@/lib/services/cuts");
    await renameAssets(unique);
  }
  if (touchedSearch) await refreshSearchText(unique);
  if (patch.deleted !== undefined || patch.projectId) {
    await audit(u.id, patch.deleted ? "assets.delete" : patch.deleted === false ? "assets.restore" : "assets.move", null, {
      count: unique.length,
      projectId: patch.projectId,
    });
  }
  return { updated: unique.length };
}

/** 휴지통 영구 삭제 (스토리지 파일 포함) */
export async function purgeAssets(u: CurrentUser, ids: string[]) {
  const access = await assetAccess(u, ids);
  const { storage } = await import("@/lib/storage");
  let n = 0;
  for (const { asset, level } of access) {
    if (!asset.deletedAt) continue;
    if (!(u.role === "admin" || asset.userId === u.id || level === "owner")) continue;
    await db.delete(assets).where(eq(assets.id, asset.id));
    await storage().delete(asset.storageKey).catch(() => {});
    if (asset.thumbKey) await storage().delete(asset.thumbKey).catch(() => {});
    n++;
  }
  await audit(u.id, "assets.purge", null, { count: n });
  return { purged: n };
}

export async function popularTags(limit = 40) {
  return db
    .select({ name: tags.name, count: sql<number>`count(${assetTags.assetId})::int` })
    .from(tags)
    .innerJoin(assetTags, eq(assetTags.tagId, tags.id))
    .groupBy(tags.name)
    .orderBy(sql`count(${assetTags.assetId}) desc`)
    .limit(limit);
}
