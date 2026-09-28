import "server-only";

import { env } from "@/lib/env";
import type { ModelDef } from "@/lib/models/types";
import type { ProviderId } from "@/lib/types";

import { fal } from "./fal";
import { higgsfield } from "./higgsfield";
import { mock } from "./mock";
import type { Provider } from "./types";

const PROVIDERS: Record<ProviderId, Provider> = { higgsfield, fal, mock };

export function getProvider(id: ProviderId): Provider {
  return PROVIDERS[id];
}

export function isProviderConfigured(id: "higgsfield" | "fal"): boolean {
  return id === "higgsfield" ? !!env.higgsfield.credentials : !!env.fal.key;
}

/**
 * 모델이 실제로 사용할 공급자.
 * - MOCK_GENERATION=1 이면 항상 모의
 * - 키가 없으면: 개발 환경에서는 모의, 운영에서는 null(사용 불가)
 */
export function resolveProvider(model: ModelDef): ProviderId | null {
  if (env.mockGeneration) return "mock";
  if (isProviderConfigured(model.provider)) return model.provider;
  return env.isProd ? null : "mock";
}

export type { Provider };
