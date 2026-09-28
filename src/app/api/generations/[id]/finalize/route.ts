import { eq } from "drizzle-orm";
import { after, type NextRequest } from "next/server";
import { z } from "zod";

import { handle, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { generations } from "@/lib/db/schema";
import { badRequest, forbidden, notFound } from "@/lib/errors";
import { getModel } from "@/lib/models/registry";
import { completeDraft, createGeneration, tick, toGenerationDTOs } from "@/lib/services/generation";
import { apiUser } from "@/lib/session";

export const maxDuration = 60;

const Body = z.object({
  mode: z.enum(["complete", "regenerate"]).default("complete"),
  resolution: z.enum(["720p", "1080p"]).default("1080p"),
});

/**
 * Seedance 드래프트 → 최종
 * - complete: 공식 드래프트 완성 API — 같은 테이크(구도·움직임·오디오) 그대로 1080p
 * - regenerate: 같은 설정으로 새로 생성 (다른 테이크가 나옴)
 */
export const POST = handle(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const u = await apiUser();
  const { id } = await ctx.params;
  const { mode, resolution } = Body.parse(await readJson(req).catch(() => ({})));
  const [gen] = await db.select().from(generations).where(eq(generations.id, id));
  if (!gen) throw notFound();
  if (gen.userId !== u.id && u.role !== "admin") throw forbidden();
  const model = getModel(gen.modelId);
  if (!model?.supportsDraft || !gen.isDraft) throw badRequest("드래프트 생성물만 완성할 수 있어요.");
  if (gen.status !== "completed") throw badRequest("드래프트가 완료된 뒤에 완성할 수 있어요.");

  const result =
    mode === "complete"
      ? await completeDraft(u, gen)
      : await createGeneration(u, {
          modelId: gen.modelId,
          prompt: gen.prompt,
          params: { ...gen.params, draft: false, resolution, bitrate: "high" },
          inputs: gen.inputs,
          count: 1,
          projectId: gen.projectId,
          parentGenerationId: gen.id,
        });
  after(() => tick({ force: true, budgetMs: 20_000 }));
  return { batchId: result.batchId, generations: await toGenerationDTOs(result.generations) };
});
