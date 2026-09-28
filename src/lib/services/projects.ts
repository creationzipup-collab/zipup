import "server-only";

import { and, count, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { assets, canvases, collections, projectMembers, projects, teams, user } from "@/lib/db/schema";
import { badRequest, forbidden } from "@/lib/errors";
import { computeAccess, requireProject, visibleProjectsWhere } from "@/lib/services/access";
import { assetUrls } from "@/lib/services/assets";
import { audit } from "@/lib/services/audit";
import { notify } from "@/lib/services/notifications";
import { getSettings } from "@/lib/services/settings";
import type { CurrentUser } from "@/lib/session";
import type { ProjectRole, Visibility } from "@/lib/types";

export const PROJECT_COLORS = ["#FF5B24", "#4C8DFF", "#A974FF", "#FF7CD9", "#3DD68C", "#F5C542", "#7CF7FF", "#E5E5E5"];

export async function listProjects(u: CurrentUser, opts: { archived?: boolean; q?: string } = {}) {
  const rows = await db
    .select({
      p: projects,
      memberRole: projectMembers.role,
      teamName: teams.name,
      ownerName: user.name,
      assetCount: sql<number>`(select count(*)::int from ${assets} where ${assets.projectId} = ${projects.id} and ${assets.deletedAt} is null)`,
      memberCount: sql<number>`(select count(*)::int from ${projectMembers} pm where pm.project_id = ${projects.id})`,
    })
    .from(projects)
    .leftJoin(projectMembers, and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, u.id)))
    .leftJoin(teams, eq(teams.id, projects.teamId))
    .innerJoin(user, eq(user.id, projects.ownerId))
    .where(
      and(
        visibleProjectsWhere(u),
        opts.archived ? isNotNull(projects.archivedAt) : isNull(projects.archivedAt),
        opts.q ? sql`${projects.name} ilike ${"%" + opts.q + "%"}` : undefined,
      ),
    )
    .orderBy(desc(projects.isPersonal), desc(projects.lastActivityAt))
    .limit(300);

  const coverIds = rows.map((r) => r.p.coverAssetId).filter(Boolean) as string[];
  const coverRows = coverIds.length ? await db.select().from(assets).where(inArray(assets.id, coverIds)) : [];
  const covers = new Map(
    await Promise.all(coverRows.map(async (a) => [a.id, { kind: a.kind, urls: await assetUrls(a) }] as const)),
  );
  return rows.map((r) => ({
    id: r.p.id,
    name: r.p.name,
    description: r.p.description,
    color: r.p.color,
    icon: r.p.icon,
    visibility: r.p.visibility,
    isPersonal: r.p.isPersonal,
    teamId: r.p.teamId,
    teamName: r.teamName,
    ownerId: r.p.ownerId,
    ownerName: r.ownerName,
    access: computeAccess(u, r.p, r.memberRole ?? null),
    assetCount: r.assetCount,
    memberCount: r.memberCount,
    lastActivityAt: r.p.lastActivityAt.toISOString(),
    createdAt: r.p.createdAt.toISOString(),
    archivedAt: r.p.archivedAt?.toISOString() ?? null,
    cover: r.p.coverAssetId ? covers.get(r.p.coverAssetId) ?? null : null,
  }));
}

export type ProjectListItem = Awaited<ReturnType<typeof listProjects>>[number];

export async function createProject(
  u: CurrentUser,
  input: { name: string; description?: string | null; visibility?: Visibility; color?: string | null; teamId?: string | null; memberIds?: string[] },
) {
  if (u.role === "viewer") throw forbidden("뷰어 권한은 프로젝트를 만들 수 없어요.");
  const settings = await getSettings();
  const [p] = await db
    .insert(projects)
    .values({
      name: input.name.trim().slice(0, 80),
      description: input.description?.trim().slice(0, 500) || null,
      visibility: input.visibility ?? settings.defaultVisibility,
      color: input.color ?? PROJECT_COLORS[Math.floor(Math.random() * PROJECT_COLORS.length)],
      ownerId: u.id,
      teamId: input.teamId === undefined ? u.teamId : input.teamId,
    })
    .returning();
  await db.insert(projectMembers).values({ projectId: p.id, userId: u.id, role: "owner" });
  if (input.memberIds?.length) await addMembers(u, p.id, input.memberIds, "editor");
  await audit(u.id, "project.create", { type: "project", id: p.id }, { name: p.name });
  return p;
}

export async function updateProject(
  u: CurrentUser,
  id: string,
  patch: { name?: string; description?: string | null; visibility?: Visibility; color?: string | null; teamId?: string | null; archived?: boolean; coverAssetId?: string | null },
) {
  const { project } = await requireProject(u, id, patch.coverAssetId !== undefined ? "editor" : "owner");
  if (project.isPersonal && (patch.visibility || patch.archived)) throw badRequest("개인 작업공간은 공개 범위를 바꾸거나 보관할 수 없어요.");
  const set: Partial<typeof projects.$inferInsert> = {};
  if (patch.name !== undefined) set.name = patch.name.trim().slice(0, 80) || project.name;
  if (patch.description !== undefined) set.description = patch.description?.trim().slice(0, 500) || null;
  if (patch.visibility) set.visibility = patch.visibility;
  if (patch.color !== undefined) set.color = patch.color;
  if (patch.teamId !== undefined) set.teamId = patch.teamId;
  if (patch.coverAssetId !== undefined) set.coverAssetId = patch.coverAssetId;
  if (patch.archived !== undefined) set.archivedAt = patch.archived ? new Date() : null;
  const [row] = await db.update(projects).set(set).where(eq(projects.id, id)).returning();
  if (patch.name && patch.name !== project.name) {
    // 파일 검색 텍스트에 프로젝트 이름이 들어가므로 갱신
    const ids = await db.select({ id: assets.id }).from(assets).where(eq(assets.projectId, id));
    const { refreshSearchText } = await import("@/lib/services/assets");
    await refreshSearchText(ids.map((x) => x.id));
  }
  await audit(u.id, "project.update", { type: "project", id }, patch as Record<string, unknown>);
  return row;
}

export async function deleteProject(u: CurrentUser, id: string) {
  const { project } = await requireProject(u, id, "owner");
  if (project.isPersonal) throw badRequest("개인 작업공간은 삭제할 수 없어요.");
  const [{ value }] = await db.select({ value: count() }).from(assets).where(eq(assets.projectId, id));
  if (value > 0 && u.role !== "admin") throw badRequest("파일이 있는 프로젝트는 보관만 할 수 있어요. (삭제는 관리자만)");
  await db.delete(projects).where(eq(projects.id, id));
  await audit(u.id, "project.delete", { type: "project", id }, { name: project.name });
}

export async function listMembers(u: CurrentUser, projectId: string) {
  await requireProject(u, projectId, "viewer");
  return db
    .select({ userId: projectMembers.userId, role: projectMembers.role, name: user.name, email: user.email, image: user.image, teamId: user.teamId })
    .from(projectMembers)
    .innerJoin(user, eq(user.id, projectMembers.userId))
    .where(eq(projectMembers.projectId, projectId));
}

export async function addMembers(u: CurrentUser, projectId: string, userIds: string[], role: ProjectRole) {
  const { project } = await requireProject(u, projectId, "owner");
  const valid = await db
    .select({ id: user.id })
    .from(user)
    .where(and(inArray(user.id, userIds), eq(user.status, "active")));
  if (!valid.length) return;
  await db
    .insert(projectMembers)
    .values(valid.map((x) => ({ projectId, userId: x.id, role })))
    .onConflictDoUpdate({ target: [projectMembers.projectId, projectMembers.userId], set: { role } });
  await notify(
    valid.map((x) => x.id).filter((x) => x !== u.id),
    { type: "project_invite", title: `${u.name}님이 '${project.name}' 프로젝트에 초대했어요`, href: `/projects/${projectId}` },
  );
}

export async function setMemberRole(u: CurrentUser, projectId: string, userId: string, role: ProjectRole | null) {
  const { project } = await requireProject(u, projectId, "owner");
  if (userId === project.ownerId) throw badRequest("프로젝트 소유자의 권한은 바꿀 수 없어요.");
  if (role === null) {
    await db.delete(projectMembers).where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));
  } else {
    await db
      .update(projectMembers)
      .set({ role })
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));
  }
}

export async function projectOverview(u: CurrentUser, id: string) {
  const { project, level } = await requireProject(u, id, "viewer");
  const [team] = project.teamId ? await db.select().from(teams).where(eq(teams.id, project.teamId)) : [];
  const [owner] = await db.select({ name: user.name }).from(user).where(eq(user.id, project.ownerId));
  const [stats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      images: sql<number>`count(*) filter (where ${assets.kind} = 'image')::int`,
      videos: sql<number>`count(*) filter (where ${assets.kind} = 'video')::int`,
      picks: sql<number>`count(*) filter (where ${assets.flag} = 'pick')::int`,
    })
    .from(assets)
    .where(and(eq(assets.projectId, id), isNull(assets.deletedAt)));
  const collectionRows = await db
    .select({
      id: collections.id,
      name: collections.name,
      description: collections.description,
      updatedAt: collections.updatedAt,
      count: sql<number>`(select count(*)::int from collection_items ci where ci.collection_id = ${collections.id})`,
    })
    .from(collections)
    .where(eq(collections.projectId, id))
    .orderBy(desc(collections.updatedAt));
  const canvasRows = await db
    .select({ id: canvases.id, name: canvases.name, updatedAt: canvases.updatedAt })
    .from(canvases)
    .where(eq(canvases.projectId, id))
    .orderBy(desc(canvases.updatedAt));
  return {
    project: {
      ...project,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
      lastActivityAt: project.lastActivityAt.toISOString(),
      archivedAt: project.archivedAt?.toISOString() ?? null,
    },
    level,
    teamName: team?.name ?? null,
    ownerName: owner?.name ?? "",
    stats: stats ?? { total: 0, images: 0, videos: 0, picks: 0 },
    collections: collectionRows.map((c) => ({ ...c, updatedAt: c.updatedAt.toISOString() })),
    canvases: canvasRows.map((c) => ({ ...c, updatedAt: c.updatedAt.toISOString() })),
  };
}
