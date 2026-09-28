import "server-only";

import { and, asc, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/lib/db";
import { assets, cuts, generations, notifications, projects, promptMessages, promptPresets, promptShares, promptVersions, teams, user } from "@/lib/db/schema";
import { badRequest, forbidden, notFound } from "@/lib/errors";
import { requireProject, visibleProjectsWhere } from "@/lib/services/access";
import { assetUrls, type AssetRow } from "@/lib/services/assets";
import { notify } from "@/lib/services/notifications";
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
  if (!p || !(await canViewPresetDeep(u, p))) throw notFound("프롬프트를 찾을 수 없어요.");
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
    /** 나온 곳 (프로젝트·컷) */
    origin?: { projectId: string | null; cutId: string | null } | null;
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
        originProjectId: input.origin?.projectId ?? null,
        originCutId: input.origin?.cutId ?? null,
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
  if (u.role === "viewer") throw forbidden("이 프롬프트에 버전을 추가할 권한이 없어요.");
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
  /** 누군가에게 공유했는지 */
  shared: boolean;
};

export async function presetDoc(u: Viewer, p: PresetRow): Promise<PromptDocDTO> {
  const [[owner], [share]] = await Promise.all([
    db.select({ name: user.name }).from(user).where(eq(user.id, p.userId)),
    db.select({ id: promptShares.id }).from(promptShares).where(eq(promptShares.presetId, p.id)).limit(1),
  ]);
  return {
    id: p.id,
    title: p.title,
    kind: p.kind,
    visibility: p.visibility,
    latestVersion: p.latestVersion,
    ownerName: owner?.name ?? null,
    canManage: canManagePreset(u, p),
    canAddVersion: u.role !== "viewer",
    tags: p.tags,
    updatedAt: p.updatedAt.toISOString(),
    shared: !!share,
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
/*                   프롬프트 라이브러리: 저장 · 받은 · 팀 · 보낸                      */
/* -------------------------------------------------------------------------- */

export type LibraryTab = "saved" | "inbox" | "team" | "sent";

export type LibraryClip = {
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
};

export type LibraryItem = {
  id: string;
  title: string;
  prompt: string;
  kind: "image" | "video" | "any";
  modelId: string | null;
  params: Record<string, unknown> | null;
  tags: string[];
  latestVersion: number;
  useCount: number;
  updatedAt: string;
  owner: string;
  mine: boolean;
  /** 이 탭에서 보여줄 공유 (저장 탭은 내가 마지막으로 보낸 공유) */
  share: {
    id: string;
    from: string;
    fromId: string;
    target: "user" | "team" | "company";
    to: string | null;
    message: string | null;
    at: string;
    seen: boolean;
  } | null;
  clip: LibraryClip | null;
  /** 나온 곳: 어느 프로젝트의 어느 컷 (저장할 때 기록, 없으면 함께 보낸 클립 기준) */
  origin: { projectId: string; projectName: string; personal: boolean; cutId: string | null; cutCode: string | null } | null;
  messages: number;
  lastMessageAt: string | null;
};

type ShareTarget = "user" | "team" | "company";

function searchCond(q?: string) {
  const t = q?.trim();
  if (!t) return undefined;
  const pat = `%${t.replace(/[\\%_]/g, (m) => "\\" + m)}%`;
  return or(ilike(promptPresets.title, pat), ilike(promptPresets.prompt, pat), sql`array_to_string(${promptPresets.tags}, ' ') ilike ${pat}`);
}

function kindCond(kind?: string) {
  return kind === "image" || kind === "video" ? or(eq(promptPresets.kind, kind), eq(promptPresets.kind, "any")) : undefined;
}

/** 나에게 온 공유 조건 (사람·팀·전사) */
function toMe(u: Viewer) {
  return or(
    and(eq(promptShares.target, "user"), eq(promptShares.toUserId, u.id)),
    u.teamId ? and(eq(promptShares.target, "team"), eq(promptShares.toTeamId, u.teamId)) : sql`false`,
    eq(promptShares.target, "company"),
  );
}

async function clipOf(a: AssetRow | null, projectName: string | null, cutCode: string | null): Promise<LibraryClip | null> {
  if (!a) return null;
  const urls = await assetUrls(a);
  return {
    assetId: a.id,
    kind: a.kind,
    width: a.width,
    height: a.height,
    durationSec: a.durationSec,
    thumb: urls.thumb,
    src: urls.src,
    projectId: a.projectId,
    projectName: projectName ?? "",
    cutCode,
    take: a.take,
    flag: a.flag,
  };
}

/** 탭별 목록 + 아직 안 본 받은 공유 수 */
export async function libraryList(u: CurrentUser, opts: { tab: LibraryTab; q?: string; kind?: string }): Promise<{ items: LibraryItem[]; unseen: number }> {
  const owner = alias(user, "owner");
  const sender = alias(user, "sender");
  const receiver = alias(user, "receiver");
  const clip = alias(assets, "clip");
  const originProject = alias(projects, "origin_project");
  const originCut = alias(cuts, "origin_cut");
  const filters = [searchCond(opts.q), kindCond(opts.kind)];
  const originCols = { originName: originProject.name, originPersonal: originProject.isPersonal, originCode: originCut.code };

  type Row = {
    p: PresetRow;
    owner: string;
    share: typeof promptShares.$inferSelect | null;
    sender: string | null;
    receiver: string | null;
    teamName: string | null;
    a: AssetRow | null;
    projectName: string | null;
    cutCode: string | null;
    originName: string | null;
    originPersonal: boolean | null;
    originCode: string | null;
  };
  let rows: Row[];

  if (opts.tab === "saved") {
    // 내가 저장한 라이브러리 프롬프트 (컷 작업 기록은 제외)
    const saved = await db
      .select({ p: promptPresets, owner: owner.name, a: clip, projectName: projects.name, cutCode: cuts.code, ...originCols })
      .from(promptPresets)
      .innerJoin(owner, eq(owner.id, promptPresets.userId))
      .leftJoin(clip, and(eq(clip.id, promptPresets.sourceAssetId), isNull(clip.deletedAt)))
      .leftJoin(projects, eq(projects.id, clip.projectId))
      .leftJoin(cuts, eq(cuts.id, clip.cutId))
      .leftJoin(originProject, eq(originProject.id, promptPresets.originProjectId))
      .leftJoin(originCut, eq(originCut.id, promptPresets.originCutId))
      .where(and(eq(promptPresets.userId, u.id), isNull(promptPresets.projectId), ...filters))
      .orderBy(desc(promptPresets.updatedAt))
      .limit(200);
    rows = saved.map((r) => ({ ...r, share: null, sender: null, receiver: null, teamName: null }));
  } else {
    const where =
      opts.tab === "inbox"
        ? and(eq(promptShares.target, "user"), eq(promptShares.toUserId, u.id))
        : opts.tab === "team"
          ? or(u.teamId ? and(eq(promptShares.target, "team"), eq(promptShares.toTeamId, u.teamId)) : sql`false`, eq(promptShares.target, "company"))
          : eq(promptShares.fromUserId, u.id);
    const shared = await db
      .select({
        p: promptPresets,
        owner: owner.name,
        share: promptShares,
        sender: sender.name,
        receiver: receiver.name,
        teamName: teams.name,
        a: clip,
        projectName: projects.name,
        cutCode: cuts.code,
        ...originCols,
      })
      .from(promptShares)
      .innerJoin(promptPresets, eq(promptPresets.id, promptShares.presetId))
      .innerJoin(owner, eq(owner.id, promptPresets.userId))
      .innerJoin(sender, eq(sender.id, promptShares.fromUserId))
      .leftJoin(receiver, eq(receiver.id, promptShares.toUserId))
      .leftJoin(teams, eq(teams.id, promptShares.toTeamId))
      .leftJoin(clip, and(eq(clip.id, sql`coalesce(${promptShares.assetId}, ${promptPresets.sourceAssetId})`), isNull(clip.deletedAt)))
      .leftJoin(projects, eq(projects.id, clip.projectId))
      .leftJoin(cuts, eq(cuts.id, clip.cutId))
      .leftJoin(originProject, eq(originProject.id, promptPresets.originProjectId))
      .leftJoin(originCut, eq(originCut.id, promptPresets.originCutId))
      .where(and(where, ...filters))
      .orderBy(desc(promptShares.createdAt))
      .limit(300);
    // 같은 프롬프트는 가장 최근 공유 하나만
    const seen = new Set<string>();
    rows = shared.filter((r) => (seen.has(r.p.id) ? false : (seen.add(r.p.id), true)));
  }

  const ids = rows.map((r) => r.p.id);
  const [msgRows, unseenRows] = await Promise.all([
    ids.length
      ? db
          .select({ presetId: promptMessages.presetId, n: sql<number>`count(*)::int`, last: sql<Date>`max(${promptMessages.createdAt})` })
          .from(promptMessages)
          .where(inArray(promptMessages.presetId, ids))
          .groupBy(promptMessages.presetId)
      : Promise.resolve([] as { presetId: string; n: number; last: Date }[]),
    db
      .select({ n: sql<number>`count(distinct ${promptShares.presetId})::int` })
      .from(promptShares)
      .where(and(eq(promptShares.target, "user"), eq(promptShares.toUserId, u.id), isNull(promptShares.seenAt))),
  ]);
  const msgs = new Map(msgRows.map((m) => [m.presetId, m]));

  const items = await Promise.all(
    rows.slice(0, 120).map(async (r): Promise<LibraryItem> => {
      const m = msgs.get(r.p.id);
      return {
        id: r.p.id,
        title: r.p.title,
        prompt: r.p.prompt,
        kind: r.p.kind,
        modelId: r.p.modelId,
        params: r.p.params,
        tags: r.p.tags,
        latestVersion: r.p.latestVersion,
        useCount: r.p.useCount,
        updatedAt: r.p.updatedAt.toISOString(),
        owner: r.owner,
        mine: r.p.userId === u.id,
        share: r.share
          ? {
              id: r.share.id,
              from: r.sender ?? "",
              fromId: r.share.fromUserId,
              target: r.share.target,
              to: r.share.target === "user" ? r.receiver : r.share.target === "team" ? r.teamName : "전사",
              message: r.share.message,
              at: r.share.createdAt.toISOString(),
              seen: r.share.target !== "user" || !!r.share.seenAt || r.share.toUserId !== u.id,
            }
          : null,
        clip: await clipOf(r.a, r.projectName, r.cutCode),
        origin: r.p.originProjectId
          ? { projectId: r.p.originProjectId, projectName: r.originName ?? "", personal: !!r.originPersonal, cutId: r.p.originCutId, cutCode: r.originCode }
          : r.a
            ? { projectId: r.a.projectId, projectName: r.projectName ?? "", personal: false, cutId: r.a.cutId, cutCode: r.cutCode }
            : null,
        messages: m?.n ?? 0,
        lastMessageAt: m?.last ? new Date(m.last).toISOString() : null,
      };
    }),
  );
  return { items, unseen: unseenRows[0]?.n ?? 0 };
}

/** 알림에서 열 때: 이 사람에게 이 프롬프트가 어느 탭에 있는지 */
export async function libraryTabFor(u: Viewer, presetId: string): Promise<LibraryTab> {
  const rows = await db
    .select({ target: promptShares.target, to: promptShares.toUserId, from: promptShares.fromUserId, owner: promptPresets.userId })
    .from(promptPresets)
    .leftJoin(promptShares, eq(promptShares.presetId, promptPresets.id))
    .where(eq(promptPresets.id, presetId));
  if (rows.some((r) => r.target === "user" && r.to === u.id)) return "inbox";
  if (rows.some((r) => r.owner === u.id)) return "saved";
  if (rows.some((r) => r.from === u.id)) return "sent";
  return "team";
}

/** 공유받았는지 (사람·팀·전사) — 비공개 프롬프트도 받은 사람은 볼 수 있어요 */
async function sharedWith(u: Viewer, presetId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: promptShares.id })
    .from(promptShares)
    .where(and(eq(promptShares.presetId, presetId), toMe(u)))
    .limit(1);
  return !!row;
}

/** 볼 수 있는지 (공개 범위 + 컷 작업 기록은 프로젝트 멤버 + 공유받은 사람) */
export async function canViewPresetDeep(u: Viewer, p: PresetRow): Promise<boolean> {
  if (canViewPreset(u, p)) return true;
  if (p.projectId) {
    try {
      await requireProject(u, p.projectId, "viewer");
      return true;
    } catch {
      return false;
    }
  }
  return sharedWith(u, p.id);
}

/**
 * 프롬프트 보내기 — 사람(여러 명)·우리 팀·전사로. 받은 사람에게 알림이 가고, 메시지는 대화방 첫 줄이 돼요.
 * - 클립에서: 그 클립의 프롬프트·모델·설정으로 (같은 내용을 이미 저장했으면 그걸 써요)
 * - 저장한 프롬프트에서: 그대로
 * - 컷 작업 기록에서: 지금 버전을 내 라이브러리에 복사해서 보내요 (받는 사람이 프로젝트 멤버가 아니어도 볼 수 있게)
 */
export async function sendPrompt(
  u: CurrentUser,
  input: {
    presetId?: string | null;
    assetId?: string | null;
    title?: string | null;
    message?: string | null;
    to: { users?: string[]; team?: boolean; company?: boolean };
  },
): Promise<{ presetId: string; sent: number }> {
  if (u.role === "viewer") throw forbidden("뷰어 권한은 공유할 수 없어요.");
  const userIds = Array.from(new Set(input.to.users ?? [])).filter((id) => id !== u.id);
  if (!userIds.length && !input.to.team && !input.to.company) throw badRequest("받을 사람이나 팀을 골라 주세요.");
  if (input.to.team && !u.teamId) throw badRequest("소속 팀이 없어서 팀으로 보낼 수 없어요.");

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

  let preset: PresetRow;
  if (input.presetId) {
    const p = await loadPreset(u, input.presetId);
    if (p.projectId) {
      // 컷 작업 기록 → 내 라이브러리로 복사
      const { preset: copy } = await createPresetWithVersion(u, {
        title: input.title?.trim().slice(0, 80) || p.title,
        prompt: p.prompt,
        kind: p.kind,
        modelId: p.modelId,
        params: p.params,
        tags: p.tags,
        visibility: "private",
        note: null,
        origin: { projectId: p.projectId, cutId: p.cutId },
      });
      preset = copy;
    } else {
      preset = p;
    }
  } else {
    const prompt = (gen?.prompt ?? source?.prompt ?? "").trim();
    if (!prompt) throw badRequest("보낼 프롬프트가 없어요.");
    const kind = gen?.kind ?? source?.kind ?? "any";
    const [existing] = await db
      .select()
      .from(promptPresets)
      .where(and(eq(promptPresets.userId, u.id), isNull(promptPresets.projectId), eq(promptPresets.prompt, prompt), eq(promptPresets.kind, kind)))
      .orderBy(desc(promptPresets.updatedAt))
      .limit(1);
    preset =
      existing ??
      (
        await createPresetWithVersion(u, {
          title: input.title?.trim().slice(0, 80) || defaultTitle(prompt),
          prompt,
          kind,
          modelId: gen?.modelId ?? source?.modelId ?? null,
          params: gen?.params ?? null,
          tags: [],
          visibility: "private",
          note: null,
          origin: source ? { projectId: source.projectId, cutId: source.cutId } : null,
        })
      ).preset;
  }

  const patch: Partial<typeof promptPresets.$inferInsert> = {};
  if (input.title?.trim() && preset.userId === u.id && input.title.trim() !== preset.title) patch.title = input.title.trim().slice(0, 80);
  if (source) patch.sourceAssetId = source.id;
  if (source && !preset.originProjectId && preset.userId === u.id) {
    patch.originProjectId = source.projectId;
    patch.originCutId = source.cutId;
  }
  if (Object.keys(patch).length) [preset] = await db.update(promptPresets).set(patch).where(eq(promptPresets.id, preset.id)).returning();

  const recipients = userIds.length
    ? await db
        .select({ id: user.id })
        .from(user)
        .where(and(inArray(user.id, userIds), eq(user.status, "active")))
    : [];
  const message = input.message?.trim() || null;
  const base = { presetId: preset.id, fromUserId: u.id, message, assetId: source?.id ?? null };
  const rows: (typeof promptShares.$inferInsert)[] = [
    ...recipients.map((r) => ({ ...base, target: "user" as ShareTarget, toUserId: r.id })),
    ...(input.to.team && u.teamId ? [{ ...base, target: "team" as ShareTarget, toTeamId: u.teamId }] : []),
    ...(input.to.company ? [{ ...base, target: "company" as ShareTarget }] : []),
  ];
  if (!rows.length) throw badRequest("받을 사람을 찾을 수 없어요.");
  await db.insert(promptShares).values(rows);
  if (message) await db.insert(promptMessages).values({ presetId: preset.id, userId: u.id, body: message });

  // 알림: 사람에게 보낸 건 그 사람에게, 팀으로 보낸 건 팀원에게 (전사는 게시판에만)
  const href = `/prompts?open=${preset.id}`;
  const body = message ? `“${message.slice(0, 80)}” · ${preset.title}` : preset.title;
  if (recipients.length) await notify(recipients.map((r) => r.id), { type: "prompt_shared", title: `${u.name}님이 프롬프트를 보냈어요`, body, href: `${href}&tab=inbox` });
  if (input.to.team && u.teamId) {
    const mates = await db
      .select({ id: user.id })
      .from(user)
      .where(and(eq(user.teamId, u.teamId), eq(user.status, "active")));
    const ids = mates.map((m) => m.id).filter((id) => id !== u.id && !recipients.some((r) => r.id === id));
    if (ids.length) await notify(ids, { type: "prompt_shared", title: `${u.name}님이 팀에 프롬프트를 공유했어요`, body, href: `${href}&tab=team` });
  }
  return { presetId: preset.id, sent: rows.length };
}

/** 내가 보낸 공유 거두기 (저장은 남아요) */
export async function unsharePrompt(u: CurrentUser, id: string) {
  await loadPreset(u, id);
  await db.delete(promptShares).where(and(eq(promptShares.presetId, id), u.role === "admin" ? undefined : eq(promptShares.fromUserId, u.id)));
}

/* -------------------------------------------------------------------------- */
/*                                   대화                                      */
/* -------------------------------------------------------------------------- */

export type PromptMessageDTO = { id: string; userId: string; name: string; image: string | null; body: string; at: string; mine: boolean };

export async function listMessages(u: CurrentUser, presetId: string): Promise<{ items: PromptMessageDTO[]; shares: { from: string; to: string | null; target: ShareTarget; at: string }[] }> {
  await loadPreset(u, presetId);
  const receiver = alias(user, "receiver");
  const sender = alias(user, "sender");
  const [rows, shareRows] = await Promise.all([
    db
      .select({ m: promptMessages, name: user.name, image: user.image })
      .from(promptMessages)
      .innerJoin(user, eq(user.id, promptMessages.userId))
      .where(eq(promptMessages.presetId, presetId))
      .orderBy(asc(promptMessages.createdAt))
      .limit(300),
    db
      .select({ s: promptShares, from: sender.name, to: receiver.name, team: teams.name })
      .from(promptShares)
      .innerJoin(sender, eq(sender.id, promptShares.fromUserId))
      .leftJoin(receiver, eq(receiver.id, promptShares.toUserId))
      .leftJoin(teams, eq(teams.id, promptShares.toTeamId))
      .where(eq(promptShares.presetId, presetId))
      .orderBy(asc(promptShares.createdAt))
      .limit(100),
  ]);
  // 연 순간 "봤음" + 이 프롬프트 알림은 읽음
  await Promise.all([
    db
      .update(promptShares)
      .set({ seenAt: new Date() })
      .where(and(eq(promptShares.presetId, presetId), eq(promptShares.target, "user"), eq(promptShares.toUserId, u.id), isNull(promptShares.seenAt))),
    db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.userId, u.id), isNull(notifications.readAt), ilike(notifications.href, `/prompts?open=${presetId}%`))),
  ]);
  return {
    items: rows.map((r) => ({ id: r.m.id, userId: r.m.userId, name: r.name, image: r.image, body: r.m.body, at: r.m.createdAt.toISOString(), mine: r.m.userId === u.id })),
    shares: shareRows.map((r) => ({ from: r.from, to: r.s.target === "user" ? r.to : r.s.target === "team" ? r.team : "전사", target: r.s.target, at: r.s.createdAt.toISOString() })),
  };
}

export async function postMessage(u: CurrentUser, presetId: string, body: string): Promise<PromptMessageDTO> {
  const preset = await loadPreset(u, presetId);
  const text = body.trim().slice(0, 2000);
  if (!text) throw badRequest("내용을 입력해 주세요.");
  const [m] = await db.insert(promptMessages).values({ presetId, userId: u.id, body: text }).returning();

  // 알림: 만든 사람 + 보낸/받은 사람 + 대화에 참여한 사람 (나 빼고, 안 읽은 같은 알림이 있으면 또 보내지 않아요)
  const [shareRows, talkers] = await Promise.all([
    db.select({ from: promptShares.fromUserId, to: promptShares.toUserId }).from(promptShares).where(eq(promptShares.presetId, presetId)),
    db.selectDistinct({ id: promptMessages.userId }).from(promptMessages).where(eq(promptMessages.presetId, presetId)),
  ]);
  const people = new Set<string>([preset.userId, ...shareRows.flatMap((r) => [r.from, r.to ?? ""]), ...talkers.map((t) => t.id)]);
  people.delete(u.id);
  people.delete("");
  const href = `/prompts?open=${presetId}`;
  if (people.size) {
    const pending = await db
      .select({ userId: notifications.userId })
      .from(notifications)
      .where(and(inArray(notifications.userId, [...people]), eq(notifications.type, "prompt_message"), eq(notifications.href, href), isNull(notifications.readAt)));
    for (const p of pending) people.delete(p.userId);
    if (people.size) await notify([...people], { type: "prompt_message", title: `${u.name}님: ${text.slice(0, 60)}`, body: preset.title, href });
  }
  return { id: m.id, userId: u.id, name: u.name, image: u.image ?? null, body: m.body, at: m.createdAt.toISOString(), mine: true };
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
