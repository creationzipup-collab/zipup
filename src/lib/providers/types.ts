import type { ProviderId } from "@/lib/types";

export type ProviderStatus = "queued" | "in_progress" | "completed" | "failed" | "nsfw" | "canceled";

export type ProviderOutput = {
  url: string;
  contentType?: string;
  width?: number;
  height?: number;
};

export type SubmitResult = {
  requestId: string;
  status: ProviderStatus;
  statusUrl?: string;
  responseUrl?: string;
  cancelUrl?: string;
  correlationId?: string;
  raw: unknown;
};

export type PollResult = {
  status: ProviderStatus;
  outputs?: ProviderOutput[];
  error?: string;
  /** 공급자가 알려준 실제 비용 (USD) */
  costUsd?: number;
  raw: unknown;
};

export type RequestRef = {
  requestId: string;
  endpoint: string;
  statusUrl?: string | null;
  responseUrl?: string | null;
  cancelUrl?: string | null;
  /** 모의 공급자용 */
  kind?: "image" | "video";
};

export type ProviderErrorCode =
  | "concurrency"
  | "auth"
  | "credits"
  | "validation"
  | "unavailable"
  | "not_found"
  | "network"
  | "unknown";

export class ProviderError extends Error {
  constructor(
    message: string,
    public code: ProviderErrorCode,
    public httpStatus?: number,
    public retryable = false,
  ) {
    super(message);
  }
}

export interface Provider {
  id: ProviderId;
  submit(endpoint: string, body: Record<string, unknown>, opts: { webhookUrl?: string; kind: "image" | "video"; expectedOutputs: number; params: Record<string, unknown> }): Promise<SubmitResult>;
  poll(ref: RequestRef): Promise<PollResult>;
  cancel(ref: RequestRef): Promise<boolean>;
  /** 요청 비용 견적 (USD). 지원하지 않으면 null */
  estimate?(endpoint: string, body: Record<string, unknown>): Promise<number | null>;
}

/** 공급자별 에러 본문에서 사람이 읽을 메시지 추출 */
export function detailMessage(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return typeof data === "string" ? data : undefined;
  const d = (data as Record<string, unknown>).detail ?? (data as Record<string, unknown>).error ?? (data as Record<string, unknown>).message;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) {
    return d
      .map((x) => {
        if (x && typeof x === "object") {
          const o = x as Record<string, unknown>;
          const loc = Array.isArray(o.loc) ? o.loc.filter((p) => p !== "body").join(".") : "";
          return `${loc ? loc + ": " : ""}${String(o.msg ?? JSON.stringify(o))}`;
        }
        return String(x);
      })
      .join("; ");
  }
  if (d && typeof d === "object") return JSON.stringify(d);
  return undefined;
}

export function mapHttpError(status: number, message: string): ProviderError {
  const lower = message.toLowerCase();
  if (status === 400 && lower.includes("concurren")) return new ProviderError(message, "concurrency", status, true);
  if (status === 401) return new ProviderError("API 인증에 실패했어요. 키를 확인해 주세요.", "auth", status);
  if (status === 402 || status === 403) return new ProviderError("공급자 계정의 크레딧이 부족해요.", "credits", status);
  if (status === 404) return new ProviderError(message || "모델 또는 요청을 찾을 수 없어요.", "not_found", status);
  if (status === 422 || status === 400) return new ProviderError(message || "요청 값이 올바르지 않아요.", "validation", status);
  if (status === 423 || status === 503) return new ProviderError("모델이 일시적으로 사용 불가 상태예요. 잠시 후 다시 시도해 주세요.", "unavailable", status, true);
  if (status === 429) return new ProviderError("요청이 너무 많아요. 잠시 후 다시 시도해요.", "concurrency", status, true);
  if (status >= 500) return new ProviderError(message || "공급자 서버 오류", "unknown", status, true);
  return new ProviderError(message || `HTTP ${status}`, "unknown", status);
}
