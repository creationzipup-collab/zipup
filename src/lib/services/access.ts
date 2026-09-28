import "server-only";

import { and, eq, exists, isNull, or, sql, type SQL } from "drizzle-orm";

import { db } from "@/lib/db";
import { projectMembers, projects } from "@/lib/db/schema";
import { forbidden, notFound } from "@/lib/errors";
import type { CurrentUser } from "@/lib/session";

export type AccessLevel = "none" | "viewer" | "editor" | "owner";
const RANK: Record<AccessLevel, number> = { none: 0, viewer: 1, editor: 2, owner: 3 };

export function atLeast(level: AccessLevel, min: AccessLevel): boolean {
  return RANK[level] >= RANK[min];
}

type ProjectRow = typeof projects.$inferSelect;
type Viewer = Pick<CurrentUser, "id" | "role" | "teamId">;

/**
 * 프로젝트 접근 수준 계산
 * - 최고관리자: 전체 owner
 * - 소유자 / 멤버(owner) : owner, 멤버(editor/viewer)는 해당 역할
 * - 팀 공개: 같은 팀원 editor (팀장은 비공개 팀 프로젝트도 editor)
 * - 전사 공개: 모든 사용자 viewer (같은 팀은 editor)
 * - 개인 작업공간: 본인만
 * - 전역 역할이 뷰어면 최대 viewer
 */
export function computeAccess(u: Viewer, p: ProjectRow, memberRole: string | null): AccessLevel {
  let level: AccessLevel = "none";
  if (u.role === "admin" || p.ownerId === u.id) level = "owner";
  else if (p.isPersonal) level = "none";
  else {
    if (memberRole === "owner") level = "owner";
    else if (memberRole === "editor") level = "editor";
    else if (memberRole === "viewer") level = "viewer";
    const sameTeam = !!u.teamId && p.teamId === u.teamId;
    if (sameTeam && (p.visibility !== "private" || u.role === "manager")) level = max(level, "editor");
    if (p.visibility === "company") level = max(level, sameTeam ? "editor" : "viewer");
  }
  if (u.role === "viewer" && atLeast(level, "editor")) level = "viewer";
  return level;
}

function max(a: AccessLevel, b: AccessLevel): AccessLevel {
  return RANK[a] >= RANK[b] ? a : b;
}

/** 목록 조회용: 사용자가 볼 수 있는 프로젝트 조건 */
export function visibleProjectsWhere(u: Viewer): SQL {
  // 관리자도 목록에서는 다른 사람의 개인 작업공간을 보지 않음 (링크로 직접 열 수는 있음)
  if (u.role === "admin") return or(eq(projects.isPersonal, false), eq(projects.ownerId, u.id))!;
  const member = exists(
    db
      .select({ one: sql`1` })
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, u.id))),
  );
  const conds: SQL[] = [eq(projects.ownerId, u.id), and(eq(projects.isPersonal, false), member)!];
  conds.push(and(eq(projects.isPersonal, false), eq(projects.visibility, "company"))!);
  if (u.teamId) {
    conds.push(
      and(
        eq(projects.isPersonal, false),
        eq(projects.teamId, u.teamId),
        u.role === "manager" ? sql`true` : sql`${projects.visibility} <> 'private'`,
      )!,
    );
  }
  return or(...conds)!;
}

export async function getProjectAccess(u: Viewer, projectId: string) {
  const rows = await db
    .select({ p: projects, memberRole: projectMembers.role })
    .from(projects)
    .leftJoin(
      projectMembers,
      and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, u.id)),
    )
    .where(eq(projects.id, projectId))
    .limit(1);
  const row = rows[0];
  if (!row) return { project: null, level: "none" as AccessLevel };
  return { project: row.p, level: computeAccess(u, row.p, row.memberRole ?? null) };
}

export async function requireProject(u: Viewer, projectId: string, min: AccessLevel) {
  const { project, level } = await getProjectAccess(u, projectId);
  if (!project || level === "none") throw notFound("프로젝트를 찾을 수 없어요.");
  if (!atLeast(level, min)) throw forbidden("이 프로젝트에 대한 권한이 없어요.");
  return { project, level };
}

/** 사용자 개인 작업공간 (없으면 생성) */
export async function ensurePersonalProject(u: Pick<CurrentUser, "id" | "teamId" | "name">): Promise<ProjectRow> {
  const existing = await db
    .select()
    .from(projects)
    .where(and(eq(projects.ownerId, u.id), eq(projects.isPersonal, true), isNull(projects.archivedAt)))
    .limit(1);
  if (existing[0]) return existing[0];
  const [created] = await db
    .insert(projects)
    .values({
      name: "내 작업공간",
      description: `${u.name}님의 개인 작업공간`,
      ownerId: u.id,
      teamId: u.teamId,
      visibility: "private",
      isPersonal: true,
      icon: "sparkles",
    })
    .onConflictDoNothing()
    .returning();
  if (!created) {
    // 동시에 다른 요청이 먼저 만든 경우
    const [row] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.ownerId, u.id), eq(projects.isPersonal, true), isNull(projects.archivedAt)))
      .limit(1);
    return row;
  }
  await db.insert(projectMembers).values({ projectId: created.id, userId: u.id, role: "owner" }).onConflictDoNothing();
  return created;
}
