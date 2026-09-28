import "server-only";

import { env } from "@/lib/env";

import {
  detailMessage,
  mapHttpError,
  ProviderError,
  type PollResult,
  type Provider,
  type ProviderOutput,
  type ProviderStatus,
  type RequestRef,
  type SubmitResult,
} from "./types";

/**
 * Higgsfield API (https://docs.higgsfield.ai)
 * - Authorization: Key KEY_ID:KEY_SECRET
 * - POST /{endpoint}?hf_webhook=... → { status, request_id, status_url, cancel_url }
 * - GET /requests/{id}/status → { status, images?, video?, audio?, error? }
 * - POST /estimate/{endpoint} → { credits, usd }
 */
function authHeader(): string {
  const c = env.higgsfield.credentials;
  if (!c) throw new ProviderError("Higgsfield API 키가 설정되지 않았어요.", "auth");
  return `Key ${c.keyId}:${c.keySecret}`;
}

async function hfFetch(path: string, init: RequestInit & { timeoutMs?: number } = {}) {
  const url = path.startsWith("http") ? path : `${env.higgsfield.baseUrl}/${path.replace(/^\//, "")}`;
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
    throw new ProviderError(`Higgsfield 연결 실패: ${(err as Error).message}`, "network", undefined, true);
  }
  const correlationId = res.headers.get("x-correlation-id") ?? undefined;
  const text = await res.text();
  let data: unknown = undefined;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg = detailMessage(data) ?? `HTTP ${res.status}`;
    throw mapHttpError(res.status, msg);
  }
  return { data: data as Record<string, unknown>, correlationId, status: res.status };
}

function normalizeStatus(s: unknown): ProviderStatus {
  switch (String(s ?? "").toLowerCase()) {
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "nsfw":
      return "nsfw";
    case "canceled":
    case "cancelled":
      return "canceled";
    case "in_progress":
      return "in_progress";
    default:
      return "queued";
  }
}

export function extractOutputs(data: Record<string, unknown>): ProviderOutput[] {
  const src = (data.payload && typeof data.payload === "object" ? data.payload : data) as Record<string, unknown>;
  const out: ProviderOutput[] = [];
  const push = (v: unknown) => {
    if (v && typeof v === "object" && typeof (v as { url?: unknown }).url === "string") {
      const o = v as { url: string; content_type?: string; width?: number; height?: number };
      out.push({ url: o.url, contentType: o.content_type, width: o.width, height: o.height });
    }
  };
  if (Array.isArray(src.images)) src.images.forEach(push);
  if (src.video) push(src.video);
  if (Array.isArray(src.videos)) src.videos.forEach(push);
  return out;
}

function extractCost(data: Record<string, unknown>): number | undefined {
  for (const k of ["usd", "cost_usd", "price_usd"]) {
    const v = Number((data as Record<string, unknown>)[k]);
    if (Number.isFinite(v) && v > 0) return v;
  }
  return undefined;
}

export const higgsfield: Provider = {
  id: "higgsfield",

  async submit(endpoint, body, opts): Promise<SubmitResult> {
    const qs = opts.webhookUrl ? `?hf_webhook=${encodeURIComponent(opts.webhookUrl)}` : "";
    const { data, correlationId } = await hfFetch(`${endpoint}${qs}`, {
      method: "POST",
      body: JSON.stringify(body),
      timeoutMs: 60_000,
    });
    const requestId = String(data.request_id ?? "");
    if (!requestId) throw new ProviderError("Higgsfield 응답에 request_id가 없어요.", "unknown");
    return {
      requestId,
      status: normalizeStatus(data.status),
      statusUrl: typeof data.status_url === "string" ? data.status_url : undefined,
      cancelUrl: typeof data.cancel_url === "string" ? data.cancel_url : undefined,
      correlationId,
      raw: data,
    };
  },

  async poll(ref: RequestRef): Promise<PollResult> {
    const url = ref.statusUrl || `requests/${ref.requestId}/status`;
    const { data } = await hfFetch(url, { method: "GET", timeoutMs: 20_000 });
    const status = normalizeStatus(data.status);
    return {
      status,
      outputs: status === "completed" ? extractOutputs(data) : undefined,
      error: typeof data.error === "string" ? data.error : undefined,
      costUsd: extractCost(data),
      raw: data,
    };
  },

  async cancel(ref: RequestRef): Promise<boolean> {
    try {
      await hfFetch(ref.cancelUrl || `requests/${ref.requestId}/cancel`, { method: "POST", timeoutMs: 15_000 });
      return true;
    } catch {
      return false;
    }
  },

  async estimate(endpoint, body): Promise<number | null> {
    try {
      const { data } = await hfFetch(`estimate/${endpoint}`, {
        method: "POST",
        body: JSON.stringify(body),
        timeoutMs: 8_000,
      });
      const usd = Number(data.usd);
      return Number.isFinite(usd) ? usd : null;
    } catch {
      return null;
    }
  },
};

/** Higgsfield 스토리지에 업로드하고 공개 URL 반환 (로컬 스토리지 개발 환경용) */
export async function higgsfieldUpload(buffer: Buffer, contentType: string): Promise<string> {
  const { data } = await hfFetch("files/generate-upload-url", {
    method: "POST",
    body: JSON.stringify({ content_type: contentType }),
  });
  const uploadUrl = String(data.upload_url ?? "");
  const publicUrl = String(data.public_url ?? "");
  const headers = (data.upload_headers ?? { "Content-Type": contentType }) as Record<string, string>;
  const res = await fetch(uploadUrl, { method: "PUT", headers, body: new Uint8Array(buffer) });
  if (!res.ok) throw new ProviderError(`Higgsfield 업로드 실패 (HTTP ${res.status})`, "network", res.status, true);
  return publicUrl;
}
