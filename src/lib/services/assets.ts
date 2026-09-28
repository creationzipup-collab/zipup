import "server-only";

import { randomUUID } from "node:crypto";

import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { assets, assetTags, projects, tags, teams, user } from "@/lib/db/schema";
import { imageMeta, makeThumbnail, videoMeta } from "@/lib/media/process";
import { getModel, MODEL_SLUG } from "@/lib/models/registry";
import { renderFilename } from "@/lib/naming";
import { getSettings } from "@/lib/services/settings";
import { extFromContentType, storage } from "@/lib/storage";
import type { AssetKind, AssetSource } from "@/lib/types";

export type AssetRow = typeof assets.$inferSelect;

/** 검색용 텍스트 구성 */
export function buildSearchText(parts: {
  prompt?: string | null;
  filename?: string | null;
  modelId?: string | null;
  kind: AssetKind;
  source: AssetSource;
  tags?: string[];
  extra?: (string | null | undefined)[];
}): string {
  const model = parts.modelId ? getModel(parts.modelId) : undefined;
  return [
    parts.prompt,
    parts.filename,
    model?.name,
    model?.vendor,
    parts.modelId ? MODEL_SLUG[parts.modelId] : undefined,
    parts.kind === "video" ? "영상 video" : "이미지 image",
    parts.source === "upload" ? "업로드 upload" : "",
    ...(parts.tags ?? []).map((t) => `#${t}`),
    ...(parts.extra ?? []),
  ]
    .filter(Boolean)
    .join(" │ ")
    .toLowerCase()
    .slice(0, 8000);
}

/** 에셋의 태그 변경 후 검색 텍스트 재계산 */
export async function refreshSearchText(assetIds: string[]) {
  if (!assetIds.length) return;
  const rows = await db
    .select({ a: assets, projectName: projects.name, creator: user.name })
    .from(assets)
    .leftJoin(projects, eq(projects.id, assets.projectId))
    .leftJoin(user, eq(user.id, assets.userId))
    .where(inArray(assets.id, assetIds));
  const tagRows = await db
    .select({ assetId: assetTags.assetId, name: tags.name })
    .from(assetTags)
    .innerJoin(tags, eq(tags.id, assetTags.tagId))
    .where(inArray(assetTags.assetId, assetIds));
  for (const { a, projectName, creator } of rows) {
    const tagNames = tagRows.filter((t) => t.assetId === a.id).map((t) => t.name);
    await db
      .update(assets)
      .set({
        searchText: buildSearchText({
          prompt: a.prompt,
          filename: a.filename,
          modelId: a.modelId,
          kind: a.kind,
          source: a.source,
          tags: tagNames,
          extra: [projectName, creator],
        }),
      })
      .where(eq(assets.id, a.id));
  }
}

/** 프로젝트 순번 발급 (원자적 증가) */
export async function nextSeq(projectId: string): Promise<number> {
  const [row] = await db
    .update(projects)
    .set({ assetSeq: sql`${projects.assetSeq} + 1`, lastActivityAt: new Date() })
    .where(eq(projects.id, projectId))
    .returning({ seq: projects.assetSeq });
  return row?.seq ?? 1;
}

export type StoreAssetInput = {
  buffer: Buffer;
  contentType: string;
  kind: AssetKind;
  source: AssetSource;
  projectId: string;
  userId: string;
  teamId: string | null;
  generationId?: string | null;
  outputIndex?: number;
  prompt?: string;
  modelId?: string | null;
  params?: Record<string, unknown>;
  /** 업로드 원본 이름 (업로드일 때 파일명에 사용) */
  originalName?: string;
  /** 이미 알고 있는 메타데이터 */
  meta?: { width?: number; height?: number; durationSec?: number };
  /** 이미 스토리지에 올라간 파일 키 (업로드) */
  existingKey?: string;
};

/** 파일을 스토리지에 저장하고 에셋 행 생성 (썸네일·메타데이터·자동 파일명 포함) */
export async function storeAsset(input: StoreAssetInput): Promise<AssetRow> {
  const id = randomUUID();
  const ext = extFromContentType(input.contentType, input.kind === "video" ? "mp4" : "png");
  const now = new Date();
  const ym = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const storageKey = input.existingKey ?? `assets/${input.projectId}/${ym}/${id}.${ext}`;

  let meta = { ...input.meta };
  let thumbKey: string | null = null;
  if (input.kind === "image") {
    try {
      const m = await imageMeta(input.buffer);
      meta = { ...meta, ...m };
      const thumb = await makeThumbnail(input.buffer);
      thumbKey = `thumbs/${input.projectId}/${id}.webp`;
      await storage().put(thumbKey, thumb, "image/webp");
    } catch (err) {
      console.warn("[assets] thumbnail failed", err);
    }
  } else {
    meta = { ...meta, ...videoMeta(input.buffer) };
  }
  if (!input.existingKey) await storage().put(storageKey, input.buffer, input.contentType);

  // 자동 파일명
  const [proj] = await db
    .select({ name: projects.name, isPersonal: projects.isPersonal, teamName: teams.name })
    .from(projects)
    .leftJoin(teams, eq(teams.id, projects.teamId))
    .where(eq(projects.id, input.projectId));
  const [creator] = await db.select({ name: user.name }).from(user).where(eq(user.id, input.userId));
  const seq = await nextSeq(input.projectId);
  const settings = await getSettings();
  const params = input.params ?? {};
  const filename =
    input.source === "upload" && input.originalName
      ? uploadName(input.originalName, ext)
      : renderFilename(settings.filenameTemplate, {
          // 개인 작업공간은 "내 작업공간" 대신 만든 사람 이름으로 (공유·다운로드 시 알아보기 쉽게)
          project: proj?.isPersonal ? `${creator?.name ?? "user"}-개인` : (proj?.name ?? "project"),
          team: proj?.teamName,
          user: creator?.name ?? "user",
          model: input.modelId ? MODEL_SLUG[input.modelId] ?? input.modelId : input.kind,
          kind: input.kind,
          date: now,
          seq,
          prompt: input.prompt ?? "",
          ratio: typeof params.aspectRatio === "string" ? params.aspectRatio : null,
          res: typeof params.resolution === "string" ? params.resolution : null,
          index: input.outputIndex ?? 0,
          ext,
        });

  const [row] = await db
    .insert(assets)
    .values({
      id,
      projectId: input.projectId,
      generationId: input.generationId ?? null,
      userId: input.userId,
      teamId: input.teamId,
      kind: input.kind,
      source: input.source,
      storageKey,
      thumbKey,
      mimeType: input.contentType,
      width: meta.width ? Math.round(meta.width) : null,
      height: meta.height ? Math.round(meta.height) : null,
      durationSec: meta.durationSec ?? null,
      sizeBytes: input.buffer.length,
      filename,
      seq,
      outputIndex: input.outputIndex ?? 0,
      prompt: input.prompt ?? "",
      modelId: input.modelId ?? null,
      searchText: buildSearchText({
        prompt: input.prompt,
        filename,
        modelId: input.modelId,
        kind: input.kind,
        source: input.source,
        extra: [proj?.name, creator?.name, typeof params.aspectRatio === "string" ? params.aspectRatio : null],
      }),
    })
    .returning();
  return row;
}

function uploadName(original: string, ext: string): string {
  const base = original.replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]+/g, "").trim() || "upload";
  return `${base.slice(0, 100)}.${ext}`;
}

/** 클라이언트에 전달할 URL 묶음 */
export type AssetUrls = { thumb: string; src: string; download: string };

export async function assetUrls(a: Pick<AssetRow, "storageKey" | "thumbKey" | "filename">): Promise<AssetUrls> {
  const s = storage();
  const [src, thumb, download] = await Promise.all([
    s.signedGetUrl(a.storageKey),
    a.thumbKey ? s.signedGetUrl(a.thumbKey) : Promise.resolve(""),
    s.signedGetUrl(a.storageKey, { downloadName: a.filename }),
  ]);
  return { src, thumb: thumb || src, download };
}

/** 공급자에게 보낼 입력 URL (외부에서 접근 가능해야 함) */
export async function providerInputUrl(
  a: Pick<AssetRow, "storageKey" | "mimeType">,
  provider: "higgsfield" | "fal" | "mock",
): Promise<string> {
  const s = storage();
  if (provider === "mock") return `mock-input://${a.storageKey}`;
  if (s.kind !== "local") return s.signedGetUrl(a.storageKey, { expiresIn: 24 * 3600 });
  // 로컬 스토리지(개발): 공급자 스토리지에 올리거나 data URI로 전달
  const buf = await s.get(a.storageKey);
  if (provider === "higgsfield") {
    const { higgsfieldUpload } = await import("@/lib/providers/higgsfield");
    return higgsfieldUpload(buf, a.mimeType);
  }
  return `data:${a.mimeType};base64,${buf.toString("base64")}`;
}

export async function loadAssetsByIds(ids: string[]): Promise<AssetRow[]> {
  if (!ids.length) return [];
  return db.select().from(assets).where(and(inArray(assets.id, ids)));
}
