import type { NextRequest } from "next/server";
import { z } from "zod";

import { handle, readJson } from "@/lib/api";
import { addPresetVersion, listVersions, loadPreset } from "@/lib/services/prompt-docs";
import { apiUser } from "@/lib/session";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: NextRequest, ctx: Ctx) => {
  const u = await apiUser();
  const preset = await loadPreset(u, (await ctx.params).id);
  return { items: await listVersions(preset.id) };
});

const Body = z.object({
  prompt: z.string().trim().min(1).max(7000),
  note: z.string().trim().max(200).nullish(),
  modelId: z.string().max(60).nullish(),
  params: z.record(z.string(), z.unknown()).nullish(),
});

/** 현재 내용을 새 버전으로 저장 */
export const POST = handle(async (req: NextRequest, ctx: Ctx) => {
  const u = await apiUser();
  const b = Body.parse(await readJson(req));
  const { version } = await addPresetVersion(u, (await ctx.params).id, b);
  return { version: version.version, id: version.id, createdAt: version.createdAt.toISOString() };
});
