import { eq, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { handle, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { promptPresets } from "@/lib/db/schema";
import { forbidden } from "@/lib/errors";
import { addPresetVersion, canManagePreset, listVersions, loadPreset, presetDoc } from "@/lib/services/prompt-docs";
import { apiUser } from "@/lib/session";

type Ctx = { params: Promise<{ id: string }> };

/** 프롬프트 + 버전 기록 */
export const GET = handle(async (_req: NextRequest, ctx: Ctx) => {
  const u = await apiUser();
  const preset = await loadPreset(u, (await ctx.params).id);
  return { doc: await presetDoc(u, preset), prompt: preset.prompt, modelId: preset.modelId, params: preset.params, versions: await listVersions(preset.id) };
});

const Patch = z.object({
  title: z.string().trim().min(1).max(80).optional(),
  /** 내용이 바뀌면 새 버전으로 저장 */
  prompt: z.string().trim().min(1).max(7000).optional(),
  note: z.string().trim().max(200).nullish(),
  tags: z.array(z.string().trim().min(1).max(30)).max(10).optional(),
  visibility: z.enum(["private", "team", "company"]).optional(),
  kind: z.enum(["image", "video", "any"]).optional(),
  used: z.boolean().optional(),
});

export const PATCH = handle(async (req: NextRequest, ctx: Ctx) => {
  const u = await apiUser();
  const preset = await loadPreset(u, (await ctx.params).id);
  const b = Patch.parse(await readJson(req));
  if (b.used) {
    await db.update(promptPresets).set({ useCount: sql`${promptPresets.useCount} + 1` }).where(eq(promptPresets.id, preset.id));
    return { ok: true };
  }
  const meta = { title: b.title, tags: b.tags, visibility: b.visibility, kind: b.kind };
  const metaChanged = Object.values(meta).some((v) => v !== undefined);
  if (metaChanged && !canManagePreset(u, preset)) throw forbidden("이름·공개 범위는 만든 사람만 바꿀 수 있어요.");
  if (metaChanged) {
    await db
      .update(promptPresets)
      .set(Object.fromEntries(Object.entries(meta).filter(([, v]) => v !== undefined)))
      .where(eq(promptPresets.id, preset.id));
  }
  let version: number | undefined;
  if (b.prompt !== undefined && b.prompt !== preset.prompt) {
    const r = await addPresetVersion(u, preset.id, { prompt: b.prompt, note: b.note ?? null });
    version = r.version.version;
  }
  return { ok: true, version };
});

export const DELETE = handle(async (_req: NextRequest, ctx: Ctx) => {
  const u = await apiUser();
  const preset = await loadPreset(u, (await ctx.params).id);
  if (!canManagePreset(u, preset)) throw forbidden();
  await db.delete(promptPresets).where(eq(promptPresets.id, preset.id));
  return { ok: true };
});
