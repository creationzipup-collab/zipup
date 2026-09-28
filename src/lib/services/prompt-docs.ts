import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { promptPresets, promptVersions, user } from "@/lib/db/schema";
import { forbidden, notFound } from "@/lib/errors";
import type { CurrentUser } from "@/lib/session";
import type { Visibility } from "@/lib/types";

type PresetRow = typeof promptPresets.$inferSelect;
type Viewer = Pick<CurrentUser, "id" | "role" | "teamId">;

/** 볼 수 있는지: 본인 · 전사 공개 · 같은 팀의 팀 공개 · 관리자 */
export function canViewPreset(u: Viewer, p: PresetRow): boolean {
  return u.role === "admin" || p.userId === u.id || p.visibility === "company" || (p.visibility === "team" && !!u.teamId && p.teamId === u.teamId);
}

/** 이름·공개 범위·삭제: 만든 사람과 관리자 */
export function canManagePreset(u: Viewer, p: PresetRow): boolean {
  return u.role === "admin" || p.userId === u.id;
}

/** 새 버전 추가: 볼 수 있는 사람 중 뷰어 권한이 아닌 사람 (팀이 함께 다듬기) */
export function canAddVersion(u: Viewer, p: PresetRow): boolean {
  return canViewPreset(u, p) && u.role !== "viewer";
}

export async function loadPreset(u: Viewer, id: string): Promise<PresetRow> {
  const [p] = await db.select().from(promptPresets).where(eq(promptPresets.id, id));
  if (!p || !canViewPreset(u, p)) throw notFound("프롬프트를 찾을 수 없어요.");
  return p;
}

export async function createPresetWithVersion(
  u: CurrentUser,
  input: {
    title: string;
    prompt: string;
    kind: "image" | "video" | "any";
    modelId?: string | null;
    params?: Record<string, unknown> | null;
    tags?: string[];
    visibility: Visibility;
    note?: string | null;
  },
) {
  return db.transaction(async (tx) => {
    const [preset] = await tx
      .insert(promptPresets)
      .values({
        title: input.title,
        prompt: input.prompt,
        kind: input.kind,
        modelId: input.modelId ?? null,
        params: input.params ?? null,
        tags: input.tags ?? [],
        visibility: input.visibility,
        userId: u.id,
        teamId: u.teamId,
        latestVersion: 1,
      })
      .returning();
    const [version] = await tx
      .insert(promptVersions)
      .values({ presetId: preset.id, version: 1, prompt: input.prompt, note: input.note ?? null, modelId: input.modelId ?? null, params: input.params ?? null, createdBy: u.id })
      .returning();
    return { preset, version };
  });
}

export async function addPresetVersion(
  u: CurrentUser,
  presetId: string,
  input: { prompt: string; note?: string | null; modelId?: string | null; params?: Record<string, unknown> | null },
) {
  const preset = await loadPreset(u, presetId);
  if (!canAddVersion(u, preset)) throw forbidden("이 프롬프트에 버전을 추가할 권한이 없어요.");
  return db.transaction(async (tx) => {
    // 동시에 저장해도 버전 번호가 겹치지 않도록 행 잠금
    const [locked] = await tx.execute<{ latest_version: number }>(sql`select latest_version from ${promptPresets} where id = ${presetId} for update`);
    const next = Number(locked?.latest_version ?? preset.latestVersion) + 1;
    const [version] = await tx
      .insert(promptVersions)
      .values({ presetId, version: next, prompt: input.prompt, note: input.note ?? null, modelId: input.modelId ?? null, params: input.params ?? null, createdBy: u.id })
      .returning();
    const [updated] = await tx
      .update(promptPresets)
      .set({
        prompt: input.prompt,
        latestVersion: next,
        ...(input.modelId !== undefined ? { modelId: input.modelId } : {}),
        ...(input.params !== undefined ? { params: input.params } : {}),
      })
      .where(eq(promptPresets.id, presetId))
      .returning();
    return { preset: updated, version };
  });
}

export type PromptVersionDTO = {
  id: string;
  version: number;
  prompt: string;
  note: string | null;
  modelId: string | null;
  params: Record<string, unknown> | null;
  authorName: string | null;
  createdAt: string;
};

export async function listVersions(presetId: string): Promise<PromptVersionDTO[]> {
  const rows = await db
    .select({ v: promptVersions, authorName: user.name })
    .from(promptVersions)
    .leftJoin(user, eq(user.id, promptVersions.createdBy))
    .where(eq(promptVersions.presetId, presetId))
    .orderBy(desc(promptVersions.version))
    .limit(200);
  return rows.map((r) => ({
    id: r.v.id,
    version: r.v.version,
    prompt: r.v.prompt,
    note: r.v.note,
    modelId: r.v.modelId,
    params: r.v.params,
    authorName: r.authorName,
    createdAt: r.v.createdAt.toISOString(),
  }));
}

export type PromptDocDTO = {
  id: string;
  title: string;
  kind: "image" | "video" | "any";
  visibility: Visibility;
  latestVersion: number;
  ownerName: string | null;
  canManage: boolean;
  canAddVersion: boolean;
  tags: string[];
  updatedAt: string;
};

export async function presetDoc(u: Viewer, p: PresetRow): Promise<PromptDocDTO> {
  const [owner] = await db.select({ name: user.name }).from(user).where(eq(user.id, p.userId));
  return {
    id: p.id,
    title: p.title,
    kind: p.kind,
    visibility: p.visibility,
    latestVersion: p.latestVersion,
    ownerName: owner?.name ?? null,
    canManage: canManagePreset(u, p),
    canAddVersion: canAddVersion(u, p),
    tags: p.tags,
    updatedAt: p.updatedAt.toISOString(),
  };
}

/** 특정 버전 내용 (없으면 최신) */
export async function versionText(presetId: string, version?: number | null): Promise<{ version: number; prompt: string } | null> {
  const [row] = await db
    .select({ version: promptVersions.version, prompt: promptVersions.prompt })
    .from(promptVersions)
    .where(version ? and(eq(promptVersions.presetId, presetId), eq(promptVersions.version, version)) : eq(promptVersions.presetId, presetId))
    .orderBy(desc(promptVersions.version))
    .limit(1);
  return row ?? null;
}
