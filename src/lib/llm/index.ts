import "server-only";

import { env } from "@/lib/env";
import { HttpError } from "@/lib/errors";

/**
 * 번역·단어 추천용 LLM 호출 (싸고 빠른 모델 우선)
 * 1) LLM_BASE_URL + LLM_API_KEY → OpenAI 호환 Chat Completions (Gemini 무료 키, OpenRouter, Groq …)
 * 2) FAL_KEY → fal.ai OpenRouter 라우터 (추가 계정 없이 fal 잔액으로 과금)
 * 3) 개발 환경에서 둘 다 없으면 모의 응답
 */
export type LlmProvider = "openai" | "fal" | "mock";

export const DEFAULT_FAL_LLM_MODEL = "google/gemini-2.5-flash-lite";

/** 관리자 화면에서 고를 수 있는 모델 (fal/OpenRouter 기준, 100만 토큰당 입력/출력 USD) */
export const LLM_MODEL_PRESETS = [
  { id: "google/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite", price: "$0.10 / $0.40", note: "한·영·중 번역 품질·속도 균형 (기본)" },
  { id: "qwen/qwen3.7-flash", label: "Qwen 3.7 Flash", price: "$0.03 / $0.13", note: "가장 저렴 · 중국어에 강함" },
  { id: "deepseek/deepseek-v4.1-flash", label: "DeepSeek V4.1 Flash", price: "$0.035 / $0.29", note: "저렴 · 표현 추천이 풍부" },
  { id: "openai/gpt-5-nano", label: "GPT-5 nano", price: "$0.05 / $0.40", note: "영어 표현이 자연스러움" },
];

export function llmProvider(): LlmProvider | null {
  const m = env.llm.mode;
  if (m === "off") return null;
  if (m === "mock") return "mock";
  if ((m === "auto" || m === "openai") && env.llm.baseUrl && env.llm.apiKey) return "openai";
  if ((m === "auto" || m === "fal") && env.fal.key) return "fal";
  return env.isProd ? null : "mock";
}

export type LlmResult = { text: string; model: string; costUsd: number; provider: LlmProvider };

type ChatOptions = {
  system: string;
  user: string;
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
  /** 관리자 설정 모델 (없으면 환경 변수·기본값) */
  model?: string | null;
  /** 모의 모드에서 돌려줄 응답 */
  mock: () => string;
};

export async function llmChat(opts: ChatOptions): Promise<LlmResult> {
  const provider = llmProvider();
  if (!provider) throw new HttpError(503, "번역·추천용 LLM이 설정되지 않았어요. 관리자에게 문의해 주세요.", "llm_unavailable");
  if (provider === "mock") return { text: opts.mock(), model: "mock", costUsd: 0, provider };
  if (provider === "openai") return openaiChat(opts);
  return falChat(opts);
}

async function openaiChat(opts: ChatOptions): Promise<LlmResult> {
  const model = env.llm.model ?? opts.model ?? "gemini-2.5-flash-lite";
  const body: Record<string, unknown> = {
    model,
    temperature: opts.temperature ?? 0.2,
    max_tokens: opts.maxTokens ?? 1500,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
  };
  if (opts.json) body.response_format = { type: "json_object" };
  let res = await post(`${env.llm.baseUrl}/chat/completions`, body, { Authorization: `Bearer ${env.llm.apiKey}` });
  // JSON 모드를 지원하지 않는 모델이면 한 번 더 (지시문만으로)
  if (!res.ok && opts.json && res.status === 400) {
    delete body.response_format;
    res = await post(`${env.llm.baseUrl}/chat/completions`, body, { Authorization: `Bearer ${env.llm.apiKey}` });
  }
  if (!res.ok) throw llmError(res.status, res.data, "openai");
  const choice = (res.data.choices as { message?: { content?: string } }[] | undefined)?.[0];
  const usage = res.data.usage as { cost?: number } | undefined;
  return { text: choice?.message?.content ?? "", model, costUsd: typeof usage?.cost === "number" ? usage.cost : 0, provider: "openai" };
}

async function falChat(opts: ChatOptions): Promise<LlmResult> {
  const model = opts.model || env.llm.model || DEFAULT_FAL_LLM_MODEL;
  const res = await post(
    "https://fal.run/openrouter/router",
    {
      model,
      system_prompt: opts.system,
      prompt: opts.user,
      temperature: opts.temperature ?? 0.2,
      max_tokens: opts.maxTokens ?? 1500,
    },
    { Authorization: `Key ${env.fal.key}` },
  );
  if (!res.ok) throw llmError(res.status, res.data, "fal");
  if (typeof res.data.error === "string" && res.data.error) throw new HttpError(502, `LLM 오류: ${res.data.error}`, "llm_error");
  const usage = res.data.usage as { cost?: number } | undefined;
  return { text: String(res.data.output ?? ""), model, costUsd: typeof usage?.cost === "number" ? usage.cost : 0, provider: "fal" };
}

async function post(url: string, body: unknown, headers: Record<string, string>) {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45_000),
      cache: "no-store",
    });
  } catch (err) {
    throw new HttpError(502, `LLM 연결 실패: ${(err as Error).message}`, "llm_network");
  }
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    data = { raw: text };
  }
  return { ok: res.ok, status: res.status, data };
}

function llmError(status: number, data: Record<string, unknown>, provider: "openai" | "fal"): HttpError {
  const detail = typeof data.detail === "string" ? data.detail : typeof data.error === "string" ? data.error : JSON.stringify(data.error ?? data).slice(0, 200);
  if (status === 401) return new HttpError(502, "LLM API 키가 올바르지 않아요.", "llm_auth");
  if (status === 402 || status === 403) {
    const credits = /balance|credit|billing|top[ _-]?up|exhausted|insufficient/i.test(detail);
    return new HttpError(402, credits ? `LLM 공급자 잔액이 부족해요.${provider === "fal" ? " (fal.ai 충전 필요)" : ""}` : `LLM 요청이 거부됐어요: ${detail}`, "llm_credits");
  }
  if (status === 429) return new HttpError(429, "LLM 요청이 많아요. 잠시 후 다시 시도해 주세요.", "llm_rate");
  return new HttpError(502, `LLM 오류 (${status}): ${detail}`, "llm_error");
}
