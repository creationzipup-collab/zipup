import "server-only";

import { env } from "@/lib/env";
import { modelProviders } from "@/lib/models/registry";
import type { ModelDef, ProviderKey } from "@/lib/models/types";
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
 * - 드래프트 요청은 공식 드래프트를 지원하는 공급자 먼저
 * - 관리자가 고정한 공급자 → 기본 공급자 → 대체 공급자 순으로, 키가 있는 첫 번째
 * - 모두 키가 없으면: 개발 환경에서는 모의, 운영에서는 null(사용 불가)
 */
export function resolveProvider(
  model: ModelDef,
  opts: { preferred?: ProviderKey | null; params?: Record<string, unknown> } = {},
): ProviderId | null {
  if (env.mockGeneration) return "mock";
  let order: ProviderKey[] = modelProviders(model);
  if (opts.preferred && order.includes(opts.preferred)) order = [opts.preferred, ...order.filter((p) => p !== opts.preferred)];
  if (model.supportsDraft && opts.params?.draft === true && model.draftProviders?.length) {
    order = [...model.draftProviders, ...order.filter((p) => !model.draftProviders!.includes(p))];
  }
  for (const p of order) if (isProviderConfigured(p)) return p;
  return env.isProd ? null : "mock";
}

export type { Provider };
