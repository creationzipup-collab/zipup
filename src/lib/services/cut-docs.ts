import "server-only";

import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { assets, cuts, generations, projects, promptPresets, promptVersions, user } from "@/lib/db/schema";
import { forbidden } from "@/lib/errors";
import { requireProject } from "@/lib/services/access";
import { assetUrls } from "@/lib/services/assets";
import { assertCutInProject } from "@/lib/services/cuts";
import type { CurrentUser } from "@/lib/session";
import type { Flag } from "@/lib/types";

/**
 * 컷 작업 기록 — 컷(컷 없는 프로젝트는 프로젝트)마다, 이미지·영상마다 하나.
 * 생성할 때 프롬프트가 바뀌었으면 자동으로 새 버전이 되고, ⌘S로 메모를 남겨 저장해요.
 * 라이브러리(저장·받은·팀·보낸)에는 안 보이고 그 컷 안에서만 버전이 올라가요.
 */

export type CutDocContext = { projectId: string; cutId: string | null; kind: "image" | "video" };

type PresetRow = typeof promptPresets.$inferSelect;
type VersionRow = typeof promptVersions.$inferSelect;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function docWhere(ctx: CutDocContext) {
  return and(
    eq(promptPresets.projectId, ctx.projectId),
    ctx.cutId ? eq(promptPresets.cutId, ctx.cutId) : isNull(promptPresets.cutId),
    eq(promptPresets.kind, ctx.kind),
  );
}

async function findDoc(tx: Tx | typeof db, ctx: CutDocContext): Promise<PresetRow | null> {
  const [row] = await tx.select().from(promptPresets).where(docWhere(ctx)).orderBy(promptPresets.createdAt).limit(1);
  return row ?? null;
}

/**
 * 이 컷의 버전 기록에 남기기. 마지막 버전과 글이 같으면 새로 만들지 않고 그 버전을 돌려줘요
 * (⌘S로 메모를 붙이면 메모만 채워요).
 */
export async function recordCutVersion(
  u: CurrentUser,
  ctx: CutDocContext & { prompt: string; modelId?: string | null; params?: Record<string, unknown> | null; note?: string | null },
  opts: { checked?: boolean } = {},
): Promise<{ doc: PresetRow; version: VersionRow; created: boolean }> {
  const prompt = ctx.prompt.trim().slice(0, 7000);
  if (!opts.checked) {
    await requireProject(u, ctx.projectId, "editor");
    if (ctx.cutId) await assertCutInProject(ctx.cutId, ctx.projectId);
  }
  if (u.role === "viewer") throw forbidden("뷰어 권한은 저장할 수 없어요.");
  const note = ctx.note?.trim().slice(0, 200) || null;

  return db.transaction(async (tx) => {
    // 같은 컷에서 동시에 생성해도 버전 번호가 겹치지 않게
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`cutdoc:${ctx.projectId}:${ctx.cutId ?? "-"}:${ctx.kind}`}))`);
    const doc = await findDoc(tx, ctx);
    if (!doc) {
      const [c] = ctx.cutId ? await tx.select({ code: cuts.code }).from(cuts).where(eq(cuts.id, ctx.cutId)) : [];
      const [p] = await tx.select({ name: projects.name }).from(projects).where(eq(projects.id, ctx.projectId));
      const [created] = await tx
        .insert(promptPresets)
        .values({
          title: `${c?.code ?? p?.name ?? "프로젝트"} · ${ctx.kind === "video" ? "영상" : "이미지"}`,
          prompt,
          kind: ctx.kind,
          modelId: ctx.modelId ?? null,
          params: ctx.params ?? null,
          visibility: "private",
          userId: u.id,
          teamId: u.teamId,
          projectId: ctx.projectId,
          cutId: ctx.cutId,
          latestVersion: 1,
        })
        .returning();
      const [version] = await tx
        .insert(promptVersions)
        .values({ presetId: created.id, version: 1, prompt, note, modelId: ctx.modelId ?? null, params: ctx.params ?? null, createdBy: u.id })
        .returning();
      return { doc: created, version, created: true };
    }
    const [latest] = await tx.select().from(promptVersions).where(eq(promptVersions.presetId, doc.id)).orderBy(desc(promptVersions.version)).limit(1);
    if (latest && latest.prompt === prompt) {
      if (note && !latest.note) {
        const [updated] = await tx.update(promptVersions).set({ note }).where(eq(promptVersions.id, latest.id)).returning();
        return { doc, version: updated, created: false };
      }
      return { doc, version: latest, created: false };
    }
    const next = (latest?.version ?? doc.latestVersion) + 1;
    const [version] = await tx
      .insert(promptVersions)
      .values({ presetId: doc.id, version: next, prompt, note, modelId: ctx.modelId ?? null, params: ctx.params ?? null, createdBy: u.id })
      .returning();
    const [updated] = await tx
      .update(promptPresets)
      .set({ prompt, latestVersion: next, modelId: ctx.modelId ?? doc.modelId, params: ctx.params ?? doc.params })
      .where(eq(promptPresets.id, doc.id))
      .returning();
    return { doc: updated, version, created: true };
  });
}

export type CutVersionTake = { id: string; kind: "image" | "video"; thumb: string; src: string; take: number | null; flag: Flag | null };

export type CutDocView = {
  doc: { id: string; title: string; version: number; canAddVersion: boolean; baseText: string } | null;
  versions: {
    id: string;
    version: number;
    prompt: string;
    note: string | null;
    modelId: string | null;
    params: Record<string, unknown> | null;
    authorName: string | null;
    createdAt: string;
    takes: CutVersionTake[];
    takeCount: number;
  }[];
};

/** 작업 기록과 버전마다 그 버전으로 나온 테이크 */
export async function cutDocView(u: CurrentUser, ctx: CutDocContext): Promise<CutDocView> {
  await requireProject(u, ctx.projectId, "viewer");
  const doc = await findDoc(db, ctx);
  if (!doc) return { doc: null, versions: [] };
  const rows = await db
    .select({ v: promptVersions, authorName: user.name })
    .from(promptVersions)
    .leftJoin(user, eq(user.id, promptVersions.createdBy))
    .where(eq(promptVersions.presetId, doc.id))
    .orderBy(desc(promptVersions.version))
    .limit(100);
  const versionIds = rows.map((r) => r.v.id);
  const takeRows = versionIds.length
    ? await db
        .select({ a: assets, versionId: generations.promptVersionId })
        .from(assets)
        .innerJoin(generations, eq(generations.id, assets.generationId))
        .where(and(inArray(generations.promptVersionId, versionIds), isNull(assets.deletedAt)))
        .orderBy(desc(assets.createdAt))
        .limit(400)
    : [];
  const byVersion = new Map<string, (typeof takeRows)[number][]>();
  for (const t of takeRows) {
    if (!t.versionId) continue;
    const list = byVersion.get(t.versionId) ?? [];
    list.push(t);
    byVersion.set(t.versionId, list);
  }
  const versions = await Promise.all(
    rows.map(async (r) => {
      const list = byVersion.get(r.v.id) ?? [];
      const takes = await Promise.all(
        list.slice(0, 6).map(async ({ a }) => {
          const urls = await assetUrls(a);
          return { id: a.id, kind: a.kind, thumb: urls.thumb, src: urls.src, take: a.take, flag: a.flag } satisfies CutVersionTake;
        }),
      );
      return {
        id: r.v.id,
        version: r.v.version,
        prompt: r.v.prompt,
        note: r.v.note,
        modelId: r.v.modelId,
        params: r.v.params,
        authorName: r.authorName,
        createdAt: r.v.createdAt.toISOString(),
        takes,
        takeCount: list.length,
      };
    }),
  );
  return {
    doc: { id: doc.id, title: doc.title, version: doc.latestVersion, canAddVersion: u.role !== "viewer", baseText: doc.prompt },
    versions,
  };
}
