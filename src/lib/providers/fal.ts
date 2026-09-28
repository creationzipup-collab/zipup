import "server-only";

import { env } from "@/lib/env";

import {
  detailMessage,
  mapHttpError,
  ProviderError,
  type PollResult,
  type Provider,
  type ProviderOutput,
  type RequestRef,
  type SubmitResult,
} from "./types";

/**
 * fal.ai 큐 API
 * - Authorization: Key FAL_KEY
 * - POST https://queue.fal.run/{endpoint}?fal_webhook=... → { request_id, status_url, response_url, cancel_url }
 * - GET status_url → { status: IN_QUEUE | IN_PROGRESS | COMPLETED }
 * - GET response_url → 모델 출력 ({ images: [{ url, width, height, content_type }] })
 */
function authHeader(): string {
  if (!env.fal.key) throw new ProviderError("fal.ai API 키(FAL_KEY)가 설정되지 않았어요.", "auth");
  return `Key ${env.fal.key}`;
}

async function falFetch(url: string, init: RequestInit & { timeoutMs?: number } = {}) {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        Authorization: authHeader(),
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(init.timeoutMs ?? 30_000),
      cache: "no-store",
    });
  } catch (err) {
    throw new ProviderError(`fal.ai 연결 실패: ${(err as Error).message}`, "network", undefined, true);
  }
  const text = await res.text();
  let data: unknown = undefined;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    data = text;
  }
  return { res, data: (data ?? {}) as Record<string, unknown> };
}

function appId(endpoint: string): string {
  // fal 큐 상태 URL은 앱 ID(앞 두 세그먼트) 기준
  return endpoint.split("/").slice(0, 2).join("/");
}

function extractOutputs(data: Record<string, unknown>): ProviderOutput[] {
  const out: ProviderOutput[] = [];
  const push = (v: unknown) => {
    if (v && typeof v === "object" && typeof (v as { url?: unknown }).url === "string") {
      const o = v as { url: string; content_type?: string; width?: number; height?: number };
      out.push({ url: o.url, contentType: o.content_type ?? undefined, width: o.width ?? undefined, height: o.height ?? undefined });
    }
  };
  if (Array.isArray(data.images)) data.images.forEach(push);
  if (data.image) push(data.image);
  if (data.video) push(data.video);
  return out;
}

function looksNsfw(message: string, data: Record<string, unknown>): boolean {
  const flags = data.has_nsfw_concepts;
  if (Array.isArray(flags) && flags.some(Boolean)) return true;
  return /nsfw|safety|content polic|moderation|blocked/i.test(message);
}

export const fal: Provider = {
  id: "fal",

  async submit(endpoint, body, opts): Promise<SubmitResult> {
    const qs = opts.webhookUrl ? `?fal_webhook=${encodeURIComponent(opts.webhookUrl)}` : "";
    const { res, data } = await falFetch(`${env.fal.queueUrl}/${endpoint}${qs}`, {
      method: "POST",
      body: JSON.stringify(body),
      timeoutMs: 60_000,
    });
    if (!res.ok) throw mapHttpError(res.status, detailMessage(data) ?? `HTTP ${res.status}`);
    const requestId = String(data.request_id ?? "");
    if (!requestId) throw new ProviderError("fal.ai 응답에 request_id가 없어요.", "unknown");
    const base = `${env.fal.queueUrl}/${appId(endpoint)}/requests/${requestId}`;
    return {
      requestId,
      status: "queued",
      statusUrl: typeof data.status_url === "string" ? data.status_url : `${base}/status`,
      responseUrl: typeof data.response_url === "string" ? data.response_url : base,
      cancelUrl: typeof data.cancel_url === "string" ? data.cancel_url : `${base}/cancel`,
      raw: data,
    };
  },

  async poll(ref: RequestRef): Promise<PollResult> {
    const base = `${env.fal.queueUrl}/${appId(ref.endpoint)}/requests/${ref.requestId}`;
    const { res, data } = await falFetch(ref.statusUrl || `${base}/status`, { method: "GET", timeoutMs: 20_000 });
    if (!res.ok) throw mapHttpError(res.status, detailMessage(data) ?? `HTTP ${res.status}`);
    const s = String(data.status ?? "");
    if (s === "IN_QUEUE") return { status: "queued", raw: data };
    if (s === "IN_PROGRESS") return { status: "in_progress", raw: data };
    if (s !== "COMPLETED") return { status: "queued", raw: data };

    // 완료: 결과 조회 (실패한 요청은 결과 조회 시 오류가 반환됨)
    const result = await falFetch(ref.responseUrl || base, { method: "GET", timeoutMs: 30_000 });
    if (!result.res.ok) {
      const msg = detailMessage(result.data) ?? `HTTP ${result.res.status}`;
      return { status: looksNsfw(msg, result.data) ? "nsfw" : "failed", error: msg, raw: result.data };
    }
    if (typeof data.error === "string" && data.error) {
      return { status: looksNsfw(data.error, result.data) ? "nsfw" : "failed", error: data.error, raw: result.data };
    }
    const outputs = extractOutputs(result.data);
    if (!outputs.length) {
      const nsfw = looksNsfw("", result.data);
      return { status: nsfw ? "nsfw" : "failed", error: nsfw ? undefined : "결과물이 비어 있어요.", raw: result.data };
    }
    return { status: "completed", outputs, raw: result.data };
  },

  async cancel(ref: RequestRef): Promise<boolean> {
    const base = `${env.fal.queueUrl}/${appId(ref.endpoint)}/requests/${ref.requestId}`;
    try {
      const { res } = await falFetch(ref.cancelUrl || `${base}/cancel`, { method: "PUT", timeoutMs: 15_000 });
      return res.ok;
    } catch {
      return false;
    }
  },
};
