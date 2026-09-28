import { and, asc, eq } from "drizzle-orm";
import { after, type NextRequest } from "next/server";
import { z } from "zod";

import { handle, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { assets, generations } from "@/lib/db/schema";
import { badRequest, forbidden, notFound } from "@/lib/errors";
import { getModel } from "@/lib/models/registry";
import { createGeneration, tick, toGenerationDTOs } from "@/lib/services/generation";
import { apiUser } from "@/lib/session";

export const maxDuration = 60;

const Body = z.object({ mode: z.enum(["keep-take", "regenerate"]).default("keep-take") });

/**
 * Seedance 드래프트 → 최종 렌더
 * - keep-take: 드래프트 영상을 소스로 720p 재렌더 (영상 편집 API, 구도·움직임 유지)
 * - regenerate: 같은 설정으로 720p 다시 생성 (API에 시드 옵션이 없어 구도는 달라질 수 있음)
 */
export const POST = handle(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const u = await apiUser();
  const { id } = await ctx.params;
  const { mode } = Body.parse(await readJson(req).catch(() => ({})));
  const [gen] = await db.select().from(generations).where(eq(generations.id, id));
  if (!gen) throw notFound();
  if (gen.userId !== u.id && u.role !== "admin") throw forbidden();
  const model = getModel(gen.modelId);
  if (!model?.supportsDraft || !gen.isDraft) throw badRequest("드래프트 생성물만 최종 렌더할 수 있어요.");
  if (gen.status !== "completed") throw badRequest("드래프트가 완료된 뒤에 최종 렌더할 수 있어요.");

  const params = { ...gen.params, draft: false, resolution: "720p", bitrate: "high" };
  let result;
  if (mode === "regenerate") {
    result = await createGeneration(u, {
      modelId: gen.modelId,
      prompt: gen.prompt,
      params,
      inputs: gen.inputs,
      count: 1,
      projectId: gen.projectId,
      parentGenerationId: gen.id,
    });
  } else {
    const [draftVideo] = await db
      .select()
      .from(assets)
      .where(and(eq(assets.generationId, gen.id), eq(assets.kind, "video")))
      .orderBy(asc(assets.outputIndex))
      .limit(1);
    if (!draftVideo) throw badRequest("드래프트 영상을 찾을 수 없어요.");
    const refImages = [...(gen.inputs.startFrame ? [gen.inputs.startFrame] : []), ...(gen.inputs.images ?? [])].slice(0, 30);
    result = await createGeneration(u, {
      modelId: gen.modelId,
      prompt:
        "Re-render this exact shot in higher fidelity. Keep the composition, camera motion, timing, characters and audio identical to the source video." +
        (gen.prompt ? ` Original direction: ${gen.prompt}` : ""),
      params: { ...params, task: "edit" },
      inputs: { videos: [draftVideo.id], images: refImages.length ? refImages : undefined },
      count: 1,
      projectId: gen.projectId,
      parentGenerationId: gen.id,
    });
  }
  after(() => tick({ force: true, budgetMs: 20_000 }));
  return { batchId: result.batchId, generations: await toGenerationDTOs(result.generations) };
});
