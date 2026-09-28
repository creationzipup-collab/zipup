import { after } from "next/server";
import { z } from "zod";

import { handle, readJson } from "@/lib/api";
import { createGeneration, recentGenerations, tick, toGenerationDTOs } from "@/lib/services/generation";
import { apiUser } from "@/lib/session";

export const maxDuration = 60;

const uuid = z.string().uuid();
const CreateSchema = z.object({
  modelId: z.string().min(1),
  prompt: z.string().max(7000).default(""),
  params: z.record(z.string(), z.unknown()).default({}),
  inputs: z
    .object({
      images: z.array(uuid).max(50).optional(),
      startFrame: uuid.optional(),
      endFrame: uuid.optional(),
      videos: z.array(uuid).max(10).optional(),
      audios: z.array(uuid).max(10).optional(),
    })
    .default({}),
  count: z.number().int().min(1).max(8).default(1),
  projectId: uuid.nullish(),
  cutId: uuid.nullish(),
  canvasId: uuid.nullish(),
  canvasNodeId: z.string().max(100).nullish(),
  parentGenerationId: uuid.nullish(),
});

export const POST = handle(async (req: Request) => {
  const u = await apiUser();
  const body = CreateSchema.parse(await readJson(req));
  const result = await createGeneration(u, body);
  after(() => tick({ force: true, budgetMs: 20_000 }));
  return { batchId: result.batchId, projectId: result.projectId, generations: await toGenerationDTOs(result.generations) };
});

export const GET = handle(async (req: Request) => {
  const u = await apiUser();
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind");
  const before = url.searchParams.get("before");
  const canvasId = url.searchParams.get("canvasId");
  const items = await recentGenerations(u, {
    kind: kind === "image" || kind === "video" ? kind : undefined,
    limit: Number(url.searchParams.get("limit") ?? 30),
    before: before ? new Date(before) : undefined,
    canvasId: canvasId ?? undefined,
  });
  return { items };
});
