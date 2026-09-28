import "server-only";

import { and, desc, eq, ilike, isNotNull, isNull, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/lib/db";
import { assets, cuts, generations, projects, promptPresets, promptVersions, user } from "@/lib/db/schema";
import { badRequest, forbidden, notFound } from "@/lib/errors";
import { requireProject, visibleProjectsWhere } from "@/lib/services/access";
import { assetUrls, type AssetRow } from "@/lib/services/assets";
import type { CurrentUser } from "@/lib/session";
import type { Flag, Visibility } from "@/lib/types";

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
  /** 게시판에 올라가 있는지 */
  shared: boolean;
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
    shared: !!p.sharedAt,
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

/* -------------------------------------------------------------------------- */
/*                              공유 게시판                                     */
/* -------------------------------------------------------------------------- */

export type SharedPromptDTO = {
  id: string;
  title: string;
  prompt: string;
  kind: "image" | "video" | "any";
  modelId: string | null;
  params: Record<string, unknown> | null;
  tags: string[];
  visibility: Visibility;
  latestVersion: number;
  useCount: number;
  author: string;
  sharedBy: string | null;
  sharedAt: string;
  mine: boolean;
  /** 이 프롬프트로 나온 클립 */
  source: {
    assetId: string;
    kind: "image" | "video";
    width: number | null;
    height: number | null;
    durationSec: number | null;
    thumb: string;
    src: string;
    projectId: string;
    projectName: string;
    cutCode: string | null;
    take: number | null;
    flag: Flag | null;
  } | null;
};

/** 직접 공유한 프롬프트만 (저장만 한 건 안 나와요) */
export async function sharedBoard(u: CurrentUser, opts: { scope?: string; q?: string; kind?: string }): Promise<SharedPromptDTO[]> {
  const visible = or(
    eq(promptPresets.userId, u.id),
    eq(promptPresets.visibility, "company"),
    u.teamId ? and(eq(promptPresets.visibility, "team"), eq(promptPresets.teamId, u.teamId)) : sql`false`,
  );
  const conds = [isNotNull(promptPresets.sharedAt), u.role === "admin" ? undefined : visible];
  if (opts.scope === "mine") conds.push(or(eq(promptPresets.sharedBy, u.id), eq(promptPresets.userId, u.id)));
  if (opts.scope === "team" && u.teamId) conds.push(eq(promptPresets.teamId, u.teamId));
  if (opts.kind === "image" || opts.kind === "video") conds.push(or(eq(promptPresets.kind, opts.kind), eq(promptPresets.kind, "any")));
  const q = opts.q?.trim();
  if (q) {
    const pat = `%${q.replace(/[\\%_]/g, (m) => "\\" + m)}%`;
    conds.push(or(ilike(promptPresets.title, pat), ilike(promptPresets.prompt, pat), sql`array_to_string(${promptPresets.tags}, ' ') ilike ${pat}`));
  }
  const sharer = alias(user, "sharer");
  const rows = await db
    .select({ p: promptPresets, author: user.name, sharedByName: sharer.name, a: assets, projectName: projects.name, cutCode: cuts.code })
    .from(promptPresets)
    .innerJoin(user, eq(user.id, promptPresets.userId))
    .leftJoin(sharer, eq(sharer.id, promptPresets.sharedBy))
    .leftJoin(assets, and(eq(assets.id, promptPresets.sourceAssetId), isNull(assets.deletedAt)))
    .leftJoin(projects, eq(projects.id, assets.projectId))
    .leftJoin(cuts, eq(cuts.id, assets.cutId))
    .where(and(...conds))
    .orderBy(desc(promptPresets.sharedAt))
    .limit(120);
  return Promise.all(
    rows.map(async (r) => {
      const urls = r.a ? await assetUrls(r.a) : null;
      return {
        id: r.p.id,
        title: r.p.title,
        prompt: r.p.prompt,
        kind: r.p.kind,
        modelId: r.p.modelId,
        params: r.p.params,
        tags: r.p.tags,
        visibility: r.p.visibility,
        latestVersion: r.p.latestVersion,
        useCount: r.p.useCount,
        author: r.author,
        sharedBy: r.sharedByName,
        sharedAt: (r.p.sharedAt ?? r.p.updatedAt).toISOString(),
        mine: r.p.userId === u.id || r.p.sharedBy === u.id,
        source:
          r.a && urls
            ? {
                assetId: r.a.id,
                kind: r.a.kind,
                width: r.a.width,
                height: r.a.height,
                durationSec: r.a.durationSec,
                thumb: urls.thumb,
                src: urls.src,
                projectId: r.a.projectId,
                projectName: r.projectName ?? "",
                cutCode: r.cutCode,
                take: r.a.take,
                flag: r.a.flag,
              }
            : null,
      };
    }),
  );
}

/**
 * 프롬프트 공유.
 * - 클립에서: 그 클립의 프롬프트·모델·설정으로 새 공유 프롬프트 (이미 있는 프롬프트면 그걸 공유하고 썸네일만 붙임)
 * - 저장한 프롬프트에서: 게시판에 올림 (썸네일 클립은 골라도 되고 안 골라도 돼요)
 */
export async function sharePrompt(
  u: CurrentUser,
  input: { assetId?: string | null; presetId?: string | null; title?: string | null; note?: string | null; tags?: string[]; visibility: "team" | "company" },
) {
  if (u.role === "viewer") throw forbidden("뷰어 권한은 공유할 수 없어요.");
  let source: AssetRow | null = null;
  let gen: { prompt: string; modelId: string; params: Record<string, unknown>; kind: "image" | "video" } | null = null;
  if (input.assetId) {
    const [a] = await db.select().from(assets).where(and(eq(assets.id, input.assetId), isNull(assets.deletedAt)));
    if (!a) throw notFound("클립을 찾을 수 없어요.");
    await requireProject(u, a.projectId, "viewer");
    source = a;
    if (a.generationId) {
      const [g] = await db.select().from(generations).where(eq(generations.id, a.generationId));
      if (g) gen = { prompt: g.prompt, modelId: g.modelId, params: g.params, kind: g.kind };
    }
    if (!gen && !a.prompt.trim()) throw badRequest("이 클립에는 프롬프트가 없어요.");
  }
  const now = new Date();
  const share = { sharedAt: now, sharedBy: u.id, visibility: input.visibility, ...(source ? { sourceAssetId: source.id } : {}) };

  if (input.presetId) {
    const preset = await loadPreset(u, input.presetId);
    if (!canManagePreset(u, preset)) throw forbidden("만든 사람만 공유할 수 있어요.");
    const [row] = await db
      .update(promptPresets)
      .set({ ...share, ...(input.title?.trim() ? { title: input.title.trim().slice(0, 80) } : {}), ...(input.tags ? { tags: input.tags } : {}) })
      .where(eq(promptPresets.id, preset.id))
      .returning();
    return row;
  }

  const prompt = (gen?.prompt ?? source?.prompt ?? "").trim();
  if (!prompt) throw badRequest("공유할 프롬프트가 없어요.");
  const { preset } = await createPresetWithVersion(u, {
    title: input.title?.trim().slice(0, 80) || defaultTitle(prompt),
    prompt,
    kind: gen?.kind ?? source?.kind ?? "any",
    modelId: gen?.modelId ?? source?.modelId ?? null,
    params: gen?.params ?? null,
    tags: input.tags ?? [],
    visibility: input.visibility,
    note: input.note ?? null,
  });
  const [row] = await db.update(promptPresets).set(share).where(eq(promptPresets.id, preset.id)).returning();
  return row;
}

/** 게시판에서 내리기 (저장은 남아요) */
export async function unsharePrompt(u: CurrentUser, id: string) {
  const preset = await loadPreset(u, id);
  if (!(canManagePreset(u, preset) || preset.sharedBy === u.id)) throw forbidden();
  await db.update(promptPresets).set({ sharedAt: null, sharedBy: null }).where(eq(promptPresets.id, id));
}

/** 이 프롬프트로 나온 클립 (공유할 때 썸네일 고르기) */
export async function promptClips(u: CurrentUser, presetId: string) {
  const preset = await loadPreset(u, presetId);
  const rows = await db
    .select({ a: assets })
    .from(assets)
    .innerJoin(projects, eq(projects.id, assets.projectId))
    .where(and(eq(assets.prompt, preset.prompt), isNull(assets.deletedAt), visibleProjectsWhere(u)))
    .orderBy(desc(assets.createdAt))
    .limit(12);
  return Promise.all(
    rows.map(async ({ a }) => {
      const urls = await assetUrls(a);
      return { id: a.id, kind: a.kind, flag: a.flag, thumb: urls.thumb, src: urls.src };
    }),
  );
}

function defaultTitle(prompt: string): string {
  const words = prompt.replace(/\s+/g, " ").trim().split(" ").slice(0, 6).join(" ");
  return words.length > 40 ? `${words.slice(0, 40)}…` : words;
}
