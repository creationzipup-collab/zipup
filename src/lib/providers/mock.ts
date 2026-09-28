import "server-only";

import type { PollResult, Provider, RequestRef, SubmitResult } from "./types";

/**
 * 모의 공급자 (API 키 없이 개발·시연용)
 * 요청 ID에 계획(종류/개수/시작시각/소요시간/비율)을 담아 서버 메모리 없이 상태를 계산합니다.
 * 프롬프트에 "fail" → 실패, "nsfw" → 검열 결과를 흉내냅니다.
 */
function ratioOf(params: Record<string, unknown>): string {
  const r = typeof params.aspectRatio === "string" ? params.aspectRatio : "1:1";
  return r === "auto" || r === "adaptive" ? "1:1" : r;
}

function dims(ratio: string, base: number): { w: number; h: number } {
  const [a, b] = ratio.split(":").map(Number);
  if (!a || !b) return { w: base, h: base };
  if (a >= b) return { w: base, h: Math.round((base * b) / a) };
  return { w: Math.round((base * a) / b), h: base };
}

export const mock: Provider = {
  id: "mock",

  async submit(_endpoint, body, opts): Promise<SubmitResult> {
    const prompt = String(body.prompt ?? "");
    const outcome = /\bfail\b/i.test(prompt) ? "F" : /\bnsfw\b/i.test(prompt) ? "N" : "C";
    const durationMs = opts.kind === "video" ? 9_000 + Math.random() * 6_000 : 3_500 + Math.random() * 3_000;
    const ratio = ratioOf(opts.params).replace(":", "x");
    const id = [
      "mock",
      opts.kind,
      opts.expectedOutputs,
      Date.now(),
      Math.round(durationMs),
      ratio,
      outcome,
      Math.random().toString(36).slice(2, 8),
    ].join("_");
    return { requestId: id, status: "queued", raw: { mock: true } };
  },

  async poll(ref: RequestRef): Promise<PollResult> {
    const [, kind, n, start, dur, ratio, outcome, rand] = ref.requestId.split("_");
    const elapsed = Date.now() - Number(start);
    if (elapsed < 1200) return { status: "queued", raw: { elapsed } };
    if (elapsed < Number(dur)) return { status: "in_progress", raw: { elapsed } };
    if (outcome === "F") return { status: "failed", error: "모의 실패 (프롬프트에 fail 포함)", raw: {} };
    if (outcome === "N") return { status: "nsfw", raw: {} };
    const r = ratio.replace("x", ":");
    if (kind === "video") {
      return {
        status: "completed",
        outputs: [{ url: `mock://video?ratio=${encodeURIComponent(r)}&seed=${rand}`, contentType: "video/mp4" }],
        raw: {},
      };
    }
    const count = Math.max(1, Number(n) || 1);
    const { w, h } = dims(r, 1536);
    return {
      status: "completed",
      outputs: Array.from({ length: count }, (_, i) => ({
        url: `mock://image?w=${w}&h=${h}&seed=${rand}${i}&i=${i}`,
        contentType: "image/png",
        width: w,
        height: h,
      })),
      raw: {},
    };
  },

  async cancel(): Promise<boolean> {
    return true;
  },

  async estimate(): Promise<number | null> {
    return null;
  },
};
