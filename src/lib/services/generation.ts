import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import { and, asc, desc, eq, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { assets, generations, projectMembers, projects, user } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { badRequest, forbidden, HttpError } from "@/lib/errors";
import { downloadOutput } from "@/lib/media/process";
import { getModel, sanitizeParams } from "@/lib/models/registry";
import { microsToUsd, usdToMicros } from "@/lib/money";
import { getProvider, resolveProvider } from "@/lib/providers";
import { ProviderError, type PollResult, type ProviderOutput } from "@/lib/providers/types";
import { canGenerate, type CurrentUser } from "@/lib/session";
import { atLeast, computeAccess, ensurePersonalProject, requireProject } from "@/lib/services/access";
import { assetUrls, loadAssetsByIds, providerInputUrl, storeAsset, type AssetRow } from "@/lib/services/assets";
import { assertBudget, getBudgetStatus } from "@/lib/services/budget";
import { adminIds, notify } from "@/lib/services/notifications";
import { getModelConfigs, getSettings } from "@/lib/services/settings";
import type { GenerationInputs, GenerationStatus, ProviderId } from "@/lib/types";

export type GenerationRow = typeof generations.$inferSelect;

export type CreateGenerationInput = {
  modelId: string;
  prompt: string;
  params: Record<string, unknown>;
  inputs?: GenerationInputs;
  count?: number;
  projectId?: string | null;
  canvasId?: string | null;
  canvasNodeId?: string | null;
  parentGenerationId?: string | null;
};

/* -------------------------------------------------------------------------- */
/*                                 Creation                                   */
/* -------------------------------------------------------------------------- */

async function loadInputAssets(u: CurrentUser, inputs: GenerationInputs) {
  const ids = [
    ...(inputs.images ?? []),
    ...(inputs.videos ?? []),
    ...(inputs.audios ?? []),
    ...(inputs.startFrame ? [inputs.startFrame] : []),
    ...(inputs.endFrame ? [inputs.endFrame] : []),
  ];
  const unique = Array.from(new Set(ids));
  const rows = await loadAssetsByIds(unique);
  const byId = new Map(rows.map((r) => [r.id, r]));
  // 접근 권한 확인 (다른 사람의 비공개 에셋 사용 방지)
  const projectIds = Array.from(new Set(rows.map((r) => r.projectId)));
  if (projectIds.length) {
    const projRows = await db
      .select({ p: projects, memberRole: projectMembers.role })
      .from(projects)
      .leftJoin(projectMembers, and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, u.id)))
      .where(inArray(projects.id, projectIds));
    for (const r of projRows) {
      if (!atLeast(computeAccess(u, r.p, r.memberRole ?? null), "viewer")) {
        throw forbidden("사용할 수 없는 입력 파일이 포함돼 있어요.");
      }
    }
  }
  for (const id of unique) if (!byId.has(id)) throw badRequest("입력 파일을 찾을 수 없어요.");
  return byId;
}

function pick<T>(byId: Map<string, T>, ids: string[] | undefined): T[] {
  return (ids ?? []).map((id) => byId.get(id)!).filter(Boolean);
}

export async function createGeneration(u: CurrentUser, input: CreateGenerationInput) {
  if (!canGenerate(u)) throw forbidden("뷰어 권한은 생성할 수 없어요. 관리자에게 권한을 요청하세요.");
  const model = getModel(input.modelId);
  if (!model) throw badRequest("알 수 없는 모델이에요.");
  const configs = await getModelConfigs();
  const config = configs[model.id];
  if (config && !config.enabled) throw badRequest(`${model.name}은(는) 관리자가 비활성화한 모델이에요.`);
  const providerId = resolveProvider(model);
  if (!providerId) {
    throw badRequest(
      `${model.provider === "higgsfield" ? "Higgsfield" : "fal.ai"} API 키가 설정되지 않아 ${model.name}을(를) 쓸 수 없어요. 관리자에게 문의하세요.`,
    );
  }

  // 저장할 프로젝트
  const project = input.projectId
    ? (await requireProject(u, input.projectId, "editor")).project
    : await ensurePersonalProject(u);

  const params = sanitizeParams(model, input.params ?? {});
  const prompt = (input.prompt ?? "").trim().slice(0, 7000);
  const inputs: GenerationInputs = input.inputs ?? {};
  const slots = model.inputsFor(params);

  // 입력 슬롯 검증
  const byId = await loadInputAssets(u, inputs);
  const images = pick(byId, inputs.images);
  const videos = pick(byId, inputs.videos);
  const audios = pick(byId, inputs.audios);
  const startFrame = inputs.startFrame ? byId.get(inputs.startFrame) : undefined;
  const endFrame = inputs.endFrame ? byId.get(inputs.endFrame) : undefined;

  if (images.length && !slots.images) throw badRequest("이 모델은 이미지 레퍼런스를 받지 않아요.");
  if (images.length > (slots.images?.max ?? 0)) throw badRequest(`이미지 레퍼런스는 최대 ${slots.images?.max}장이에요.`);
  if (videos.length && !slots.videos) throw badRequest("이 모델은 영상 입력을 받지 않아요.");
  if (videos.length > (slots.videos?.max ?? 0)) throw badRequest(`영상 입력은 최대 ${slots.videos?.max}개예요.`);
  if (audios.length && !slots.audios) throw badRequest("이 모델은 오디오 입력을 받지 않아요.");
  if (startFrame && !slots.startFrame) throw badRequest("이 모델은 시작 프레임을 받지 않아요.");
  if (endFrame && !slots.endFrame) throw badRequest("이 모델은 끝 프레임을 받지 않아요.");
  if (endFrame && !startFrame) throw badRequest("끝 프레임은 시작 프레임과 함께 넣어 주세요.");
  for (const a of [...images, ...(startFrame ? [startFrame] : []), ...(endFrame ? [endFrame] : [])]) {
    if (a.kind !== "image") throw badRequest("이미지 자리에 영상이 들어갔어요.");
  }
  for (const a of videos) if (a.kind !== "video") throw badRequest("영상 자리에 이미지가 들어갔어요.");

  const invalid = model.validate?.({
    prompt,
    params,
    refImages: images.length,
    hasStartFrame: !!startFrame,
    refVideos: videos.length,
    refAudios: audios.length,
  });
  if (invalid) throw badRequest(invalid);

  const count = Math.min(model.count.max, Math.max(1, Math.round(input.count ?? 1)));
  const perRequest = model.count.native ? [count] : Array.from({ length: count }, () => 1);

  // 공급자에 보낼 URL
  const toUrl = (a: AssetRow) => providerInputUrl(a, providerId);
  const urls = {
    images: await Promise.all(images.map(toUrl)),
    videos: await Promise.all(videos.map(toUrl)),
    audios: await Promise.all(audios.map(toUrl)),
    startFrame: startFrame ? await toUrl(startFrame) : undefined,
    endFrame: endFrame ? await toUrl(endFrame) : undefined,
  };

  const prices = config?.priceOverrides ?? {};
  const now = new Date();
  const inputVideoSeconds = videos[0]?.durationSec ?? 0;
  const built = perRequest.map((n) => model.build({ prompt, params, urls, count: n }));

  // 비용 견적: Higgsfield는 견적 API, 실패 시 로컬 단가표
  let liveUsd: number | null = null;
  if (providerId === "higgsfield") {
    liveUsd = (await getProvider("higgsfield").estimate?.(built[0].endpoint, built[0].body)) ?? null;
  }
  const estimates = perRequest.map((n) => {
    const local = model.estimate(
      { params, count: n, refImages: images.length, hasStartFrame: !!startFrame, refVideos: videos.length, inputVideoSeconds, now },
      prices,
    );
    return usdToMicros(liveUsd ?? local);
  });
  const totalMicros = estimates.reduce((a, b) => a + b, 0);

  const batchId = randomUUID();
  const isDraft = !!model.supportsDraft && params.draft === true;

  const rows = await db.transaction(async (tx) => {
    await assertBudget(tx, u, totalMicros);
    return tx
      .insert(generations)
      .values(
        built.map((b, i) => ({
          batchId,
          projectId: project.id,
          userId: u.id,
          teamId: u.teamId,
          modelId: model.id,
          provider: providerId,
          endpoint: b.endpoint,
          kind: model.kind,
          workflow: b.workflow,
          status: "pending" as GenerationStatus,
          prompt,
          params,
          inputs,
          requestBody: b.body,
          estimatedCostMicros: estimates[i],
          expectedOutputs: b.expectedOutputs,
          isDraft,
          parentGenerationId: input.parentGenerationId ?? null,
          canvasId: input.canvasId ?? null,
          canvasNodeId: input.canvasNodeId ?? null,
        })),
      )
      .returning();
  });

  await db.update(projects).set({ lastActivityAt: new Date() }).where(eq(projects.id, project.id));
  void checkBudgetWarning(u, totalMicros).catch(() => {});
  return { batchId, projectId: project.id, generations: rows };
}

/** 예산 경고: 이번 요청으로 경고 기준(%)을 막 넘었을 때만 알림 */
async function checkBudgetWarning(u: CurrentUser, addedMicros: number) {
  const settings = await getSettings();
  const warn = settings.budgetWarnPercent / 100;
  const status = await getBudgetStatus(u);
  const crossed = (spent: number, cap: number | null) =>
    !!cap && (spent - addedMicros) / cap < warn && spent / cap >= warn;
  if (crossed(status.user.spent, status.user.cap)) {
    await notify(u.id, {
      type: "budget_warning",
      title: `개인 월 예산의 ${Math.round((status.user.spent / status.user.cap!) * 100)}%를 사용했어요`,
      body: `이번 달 $${microsToUsd(status.user.spent).toFixed(2)} / $${microsToUsd(status.user.cap!).toFixed(2)}`,
      href: "/settings",
    });
  }
  if (status.team && crossed(status.team.spent, status.team.cap)) {
    const managers = await db
      .select({ id: user.id })
      .from(user)
      .where(and(eq(user.teamId, status.team.id), eq(user.role, "manager"), eq(user.status, "active")));
    await notify([u.id, ...managers.map((m) => m.id), ...(await adminIds())], {
      type: "budget_warning",
      title: `${status.team.name} 월 예산의 ${Math.round((status.team.spent / status.team.cap!) * 100)}%를 사용했어요`,
      body: `이번 달 $${microsToUsd(status.team.spent).toFixed(2)} / $${microsToUsd(status.team.cap!).toFixed(2)}`,
      href: "/admin/teams",
    });
  }
}

/* -------------------------------------------------------------------------- */
/*                                 Dispatch                                   */
/* -------------------------------------------------------------------------- */

function webhookUrlFor(gen: GenerationRow): string | undefined {
  if (!/^https:\/\//.test(env.appUrl) || /localhost|127\.0\.0\.1/.test(env.appUrl)) return undefined;
  if (gen.provider === "mock") return undefined;
  const sig = createHmac("sha256", env.authSecret ?? "dev").update(`webhook:${gen.id}`).digest("base64url");
  return `${env.appUrl}/api/webhooks/${gen.provider}?gid=${gen.id}&sig=${sig}`;
}

export function verifyWebhookSignature(gid: string, sig: string): boolean {
  const expected = Buffer.from(createHmac("sha256", env.authSecret ?? "dev").update(`webhook:${gid}`).digest("base64url"));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

const PROVIDERS: ProviderId[] = ["higgsfield", "fal", "mock"];

/** 사내 대기열(pending)에서 공급자 동시 실행 한도만큼 꺼내 제출 */
export async function dispatch(only?: ProviderId) {
  const settings = await getSettings();
  for (const p of PROVIDERS) {
    if (only && p !== only) continue;
    const limit = Math.max(1, settings.concurrency[p] ?? 4);
    const claimed = await db.transaction(async (tx) => {
      const lock = await tx.execute(sql`select pg_try_advisory_xact_lock(hashtext(${"dispatch:" + p})) as ok`);
      if (!(lock as unknown as { ok: boolean }[])[0]?.ok) return [] as string[];
      const res = await tx.execute(sql`
        with inflight as (
          select count(*)::int as n from generations
          where provider = ${p} and status in ('queued', 'in_progress')
        ), picked as (
          select id from generations
          where provider = ${p} and status = 'pending'
          order by created_at asc
          limit greatest(0, ${limit} - (select n from inflight))
          for update skip locked
        )
        update generations g
        set status = 'queued', submitted_at = now(), submit_attempts = g.submit_attempts + 1, updated_at = now()
        from picked where g.id = picked.id
        returning g.id`);
      return (res as unknown as { id: string }[]).map((r) => r.id);
    });
    if (!claimed.length) continue;
    const rows = await db.select().from(generations).where(inArray(generations.id, claimed)).orderBy(asc(generations.createdAt));
    for (const gen of rows) {
      const stop = await submitOne(gen);
      if (stop) {
        // 동시 실행 한도 도달: 남은 항목은 다시 대기열로
        const rest = rows.filter((r) => r.id !== gen.id && !r.providerRequestId).map((r) => r.id);
        const pending = await db
          .select({ id: generations.id })
          .from(generations)
          .where(and(inArray(generations.id, rest), isNull(generations.providerRequestId), eq(generations.status, "queued")));
        if (pending.length) {
          await db
            .update(generations)
            .set({ status: "pending", submittedAt: null })
            .where(inArray(generations.id, pending.map((x) => x.id)));
        }
        break;
      }
    }
  }
}

/** @returns true = 동시 실행 한도 도달 (이 공급자 제출 중단) */
async function submitOne(gen: GenerationRow): Promise<boolean> {
  const provider = getProvider(gen.provider);
  try {
    const res = await provider.submit(gen.endpoint, gen.requestBody ?? {}, {
      webhookUrl: webhookUrlFor(gen),
      kind: gen.kind,
      expectedOutputs: gen.expectedOutputs,
      params: gen.params,
    });
    await db
      .update(generations)
      .set({
        providerRequestId: res.requestId,
        providerStatusUrl: res.statusUrl ?? null,
        providerResponseUrl: res.responseUrl ?? null,
        providerCancelUrl: res.cancelUrl ?? null,
        correlationId: res.correlationId ?? null,
        status: res.status === "in_progress" ? "in_progress" : "queued",
        nextPollAt: new Date(Date.now() + (gen.kind === "video" ? 5000 : 2000)),
        errorMessage: null,
      })
      .where(eq(generations.id, gen.id));
    return false;
  } catch (err) {
    const pe = err instanceof ProviderError ? err : null;
    if (pe && (pe.code === "concurrency" || pe.code === "unavailable") && gen.submitAttempts < 30) {
      await db
        .update(generations)
        .set({ status: "pending", submittedAt: null, errorMessage: pe.code === "unavailable" ? pe.message : null })
        .where(eq(generations.id, gen.id));
      return true;
    }
    await failGeneration(gen, "failed", pe?.message ?? (err as Error).message ?? "제출에 실패했어요.");
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/*                                   Sync                                     */
/* -------------------------------------------------------------------------- */

function nextPollDelay(gen: GenerationRow): number {
  const n = gen.pollAttempts;
  return gen.kind === "video" ? Math.min(15_000, 4_000 + n * 1_500) : Math.min(8_000, 2_000 + n * 750);
}

export async function syncGeneration(genId: string) {
  const [gen] = await db.select().from(generations).where(eq(generations.id, genId));
  if (!gen) return;
  if (gen.status === "finalizing") return retryFinalize(gen);
  if (!["queued", "in_progress"].includes(gen.status) || !gen.providerRequestId) return;

  const provider = getProvider(gen.provider);
  let res: PollResult;
  try {
    res = await provider.poll({
      requestId: gen.providerRequestId,
      endpoint: gen.endpoint,
      statusUrl: gen.providerStatusUrl,
      responseUrl: gen.providerResponseUrl,
      cancelUrl: gen.providerCancelUrl,
      kind: gen.kind,
    });
  } catch (err) {
    const pe = err instanceof ProviderError ? err : null;
    const attempts = gen.pollAttempts + 1;
    if (pe && (pe.code === "not_found" || pe.code === "auth") && attempts > 8) {
      await failGeneration(gen, "failed", pe.message);
      return;
    }
    await db
      .update(generations)
      .set({ pollAttempts: attempts, lastPolledAt: new Date(), nextPollAt: new Date(Date.now() + Math.min(60_000, 5_000 * attempts)) })
      .where(eq(generations.id, gen.id));
    return;
  }

  if (res.status === "queued" || res.status === "in_progress") {
    await db
      .update(generations)
      .set({
        status: res.status,
        startedAt: res.status === "in_progress" ? (gen.startedAt ?? new Date()) : gen.startedAt,
        pollAttempts: gen.pollAttempts + 1,
        lastPolledAt: new Date(),
        nextPollAt: new Date(Date.now() + nextPollDelay(gen)),
      })
      .where(and(eq(generations.id, gen.id), inArray(generations.status, ["queued", "in_progress"])));
    return;
  }
  if (res.status === "completed") return finalize(gen, res);
  return failGeneration(gen, res.status, res.error);
}

async function failGeneration(gen: GenerationRow, status: "failed" | "nsfw" | "canceled", error?: string) {
  const message =
    error ||
    (status === "nsfw" ? "콘텐츠 정책에 의해 차단됐어요. (비용 환불)" : status === "canceled" ? "취소됐어요." : "생성에 실패했어요. (비용 환불)");
  const updated = await db
    .update(generations)
    .set({ status, errorMessage: message, costMicros: 0, completedAt: new Date() })
    .where(and(eq(generations.id, gen.id), inArray(generations.status, ["pending", "queued", "in_progress", "finalizing"])))
    .returning({ id: generations.id });
  if (updated.length && status !== "canceled") {
    const model = getModel(gen.modelId);
    await notify(gen.userId, {
      type: "generation_failed",
      title: `${model?.name ?? gen.modelId} ${status === "nsfw" ? "생성이 차단됐어요" : "생성에 실패했어요"}`,
      body: message.slice(0, 200),
      href: `/create/${gen.kind}`,
    });
  }
}

async function finalize(gen: GenerationRow, res: PollResult) {
  const outputs = res.outputs ?? [];
  const claimed = await db
    .update(generations)
    .set({
      status: "finalizing",
      providerPayload: { outputs, costUsd: res.costUsd ?? null, raw: res.raw },
      lastPolledAt: new Date(),
    })
    .where(and(eq(generations.id, gen.id), inArray(generations.status, ["queued", "in_progress"])))
    .returning();
  if (!claimed.length) return;
  await storeOutputs(claimed[0], outputs, res.costUsd);
}

async function retryFinalize(gen: GenerationRow) {
  if (gen.nextPollAt && gen.nextPollAt.getTime() > Date.now()) return;
  const claimed = await db
    .update(generations)
    .set({ lastPolledAt: new Date() })
    .where(
      and(
        eq(generations.id, gen.id),
        eq(generations.status, "finalizing"),
        or(isNull(generations.lastPolledAt), lte(generations.lastPolledAt, new Date(Date.now() - 120_000))),
      ),
    )
    .returning();
  if (!claimed.length) return;
  const payload = (claimed[0].providerPayload ?? {}) as { outputs?: ProviderOutput[]; costUsd?: number | null };
  await storeOutputs(claimed[0], payload.outputs ?? [], payload.costUsd ?? undefined);
}

async function storeOutputs(gen: GenerationRow, outputs: ProviderOutput[], costUsd?: number | null) {
  try {
    if (!outputs.length) throw new Error("결과물이 없어요.");
    const existing = await db
      .select({ outputIndex: assets.outputIndex, id: assets.id })
      .from(assets)
      .where(eq(assets.generationId, gen.id));
    const done = new Set(existing.map((e) => e.outputIndex));
    const created: string[] = existing.map((e) => e.id);
    for (let i = 0; i < outputs.length; i++) {
      if (done.has(i)) continue;
      const o = outputs[i];
      const dl = await downloadOutput(o.url, gen.kind === "video" ? "video/mp4" : "image/png");
      const kind = dl.contentType.startsWith("video/") ? "video" : "image";
      const asset = await storeAsset({
        buffer: dl.buffer,
        contentType: dl.contentType,
        kind,
        source: "generated",
        projectId: gen.projectId,
        userId: gen.userId,
        teamId: gen.teamId,
        generationId: gen.id,
        outputIndex: i,
        prompt: gen.prompt,
        modelId: gen.modelId,
        params: gen.params,
        meta: { width: o.width, height: o.height },
      });
      created.push(asset.id);
    }
    const costMicros = costUsd != null && costUsd > 0 ? usdToMicros(costUsd) : gen.estimatedCostMicros;
    await db
      .update(generations)
      .set({ status: "completed", outputCount: created.length, completedAt: new Date(), costMicros, errorMessage: null })
      .where(eq(generations.id, gen.id));

    // 프로젝트 커버 자동 지정
    await db
      .update(projects)
      .set({ coverAssetId: created[0], lastActivityAt: new Date() })
      .where(and(eq(projects.id, gen.projectId), isNull(projects.coverAssetId)));

    const tookMs = Date.now() - gen.createdAt.getTime();
    if (gen.kind === "video" || tookMs > 60_000) {
      const model = getModel(gen.modelId);
      await notify(gen.userId, {
        type: "generation_completed",
        title: `${model?.name ?? gen.modelId} ${gen.kind === "video" ? "영상" : "이미지"}이 완성됐어요`,
        body: gen.prompt.slice(0, 120) || undefined,
        href: `/library?asset=${created[0]}`,
      });
    }
  } catch (err) {
    const attempts = gen.pollAttempts + 1;
    const msg = `결과 저장 실패: ${(err as Error).message}`;
    if (attempts >= 6) {
      await db
        .update(generations)
        .set({ status: "failed", errorMessage: msg, completedAt: new Date(), costMicros: gen.estimatedCostMicros })
        .where(eq(generations.id, gen.id));
    } else {
      await db
        .update(generations)
        .set({ errorMessage: msg, pollAttempts: attempts, nextPollAt: new Date(Date.now() + 30_000 * attempts) })
        .where(eq(generations.id, gen.id));
    }
    console.error("[generation] store outputs failed", gen.id, err);
  }
}

/* -------------------------------------------------------------------------- */
/*                                   Tick                                     */
/* -------------------------------------------------------------------------- */

let lastTick = 0;
let ticking = false;

/**
 * 대기열 제출 + 상태 동기화 + 복구. Vercel Cron(매분), 웹훅, 클라이언트 폴링에서 호출됩니다.
 * 같은 인스턴스에서 짧은 시간 안에 중복 실행되지 않도록 제한합니다.
 */
export async function tick(opts: { budgetMs?: number; maxSync?: number; force?: boolean } = {}) {
  const now = Date.now();
  if (!opts.force && (ticking || now - lastTick < 1500)) return { skipped: true };
  ticking = true;
  lastTick = now;
  const budget = opts.budgetMs ?? 8_000;
  let synced = 0;
  try {
    // 제출 도중 멈춘 요청 복구 (요청 ID 없이 3분 이상 queued)
    await db
      .update(generations)
      .set({ status: "pending", submittedAt: null })
      .where(
        and(
          eq(generations.status, "queued"),
          isNull(generations.providerRequestId),
          lte(generations.submittedAt, new Date(now - 180_000)),
        ),
      );

    await dispatch();

    const due = await db
      .select({ id: generations.id })
      .from(generations)
      .where(
        or(
          and(
            inArray(generations.status, ["queued", "in_progress"]),
            isNotNull(generations.providerRequestId),
            or(isNull(generations.nextPollAt), lte(generations.nextPollAt, new Date())),
          ),
          and(eq(generations.status, "finalizing"), or(isNull(generations.nextPollAt), lte(generations.nextPollAt, new Date()))),
        ),
      )
      .orderBy(asc(generations.nextPollAt))
      .limit(opts.maxSync ?? 16);

    const queue = [...due];
    const workers = Array.from({ length: 4 }, async () => {
      while (queue.length && Date.now() - now < budget) {
        const next = queue.shift()!;
        try {
          await syncGeneration(next.id);
          synced++;
        } catch (err) {
          console.error("[tick] sync failed", next.id, err);
        }
      }
    });
    await Promise.all(workers);
    if (synced) await dispatch();
  } finally {
    ticking = false;
  }
  return { skipped: false, synced };
}

/* -------------------------------------------------------------------------- */
/*                                 Commands                                   */
/* -------------------------------------------------------------------------- */

export async function cancelGeneration(u: CurrentUser, id: string) {
  const [gen] = await db.select().from(generations).where(eq(generations.id, id));
  if (!gen) throw new HttpError(404, "생성 작업을 찾을 수 없어요.");
  if (gen.userId !== u.id && u.role !== "admin") throw forbidden();
  if (gen.status === "pending") {
    await failGeneration(gen, "canceled");
    return { canceled: true };
  }
  if (gen.status === "queued" && gen.providerRequestId) {
    const ok = await getProvider(gen.provider).cancel({
      requestId: gen.providerRequestId,
      endpoint: gen.endpoint,
      cancelUrl: gen.providerCancelUrl,
      statusUrl: gen.providerStatusUrl,
    });
    if (ok) {
      await failGeneration(gen, "canceled");
      return { canceled: true };
    }
  }
  throw badRequest("이미 생성이 시작돼서 취소할 수 없어요.");
}

/** 클라이언트 표시용 */
export type GenerationDTO = {
  id: string;
  batchId: string;
  projectId: string;
  modelId: string;
  kind: "image" | "video";
  workflow: string;
  status: GenerationStatus;
  prompt: string;
  params: Record<string, unknown>;
  inputs: GenerationInputs;
  errorMessage: string | null;
  estimatedCostMicros: number;
  costMicros: number | null;
  expectedOutputs: number;
  isDraft: boolean;
  parentGenerationId: string | null;
  canvasNodeId: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  provider: ProviderId;
  outputs: {
    id: string;
    kind: "image" | "video";
    width: number | null;
    height: number | null;
    durationSec: number | null;
    filename: string;
    rating: number;
    flag: string | null;
    urls: { thumb: string; src: string; download: string };
  }[];
};

export async function toGenerationDTOs(rows: GenerationRow[]): Promise<GenerationDTO[]> {
  if (!rows.length) return [];
  const outs = await db
    .select()
    .from(assets)
    .where(and(inArray(assets.generationId, rows.map((r) => r.id)), isNull(assets.deletedAt)))
    .orderBy(asc(assets.outputIndex));
  const withUrls = await Promise.all(outs.map(async (a) => ({ a, urls: await assetUrls(a) })));
  return rows.map((g) => ({
    id: g.id,
    batchId: g.batchId,
    projectId: g.projectId,
    modelId: g.modelId,
    kind: g.kind,
    workflow: g.workflow,
    status: g.status,
    prompt: g.prompt,
    params: g.params,
    inputs: g.inputs,
    errorMessage: g.errorMessage,
    estimatedCostMicros: g.estimatedCostMicros,
    costMicros: g.costMicros,
    expectedOutputs: g.expectedOutputs,
    isDraft: g.isDraft,
    parentGenerationId: g.parentGenerationId,
    canvasNodeId: g.canvasNodeId,
    createdAt: g.createdAt.toISOString(),
    startedAt: g.startedAt?.toISOString() ?? null,
    completedAt: g.completedAt?.toISOString() ?? null,
    provider: g.provider,
    outputs: withUrls
      .filter((x) => x.a.generationId === g.id)
      .map(({ a, urls }) => ({
        id: a.id,
        kind: a.kind,
        width: a.width,
        height: a.height,
        durationSec: a.durationSec,
        filename: a.filename,
        rating: a.rating,
        flag: a.flag,
        urls,
      })),
  }));
}

export async function recentGenerations(u: CurrentUser, opts: { kind?: "image" | "video"; limit?: number; before?: Date; canvasId?: string }) {
  const conds = [eq(generations.userId, u.id)];
  if (opts.kind) conds.push(eq(generations.kind, opts.kind));
  if (opts.before) conds.push(lte(generations.createdAt, opts.before));
  if (opts.canvasId) conds.push(eq(generations.canvasId, opts.canvasId));
  const rows = await db
    .select()
    .from(generations)
    .where(and(...conds))
    .orderBy(desc(generations.createdAt))
    .limit(Math.min(100, opts.limit ?? 40));
  return toGenerationDTOs(rows);
}
