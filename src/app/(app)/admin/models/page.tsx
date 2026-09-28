import type { Metadata } from "next";

import { type AdminModelItem, ModelsAdmin } from "@/components/admin/models-admin";
import { modelProviders, MODELS } from "@/lib/models/registry";
import { isProviderConfigured, resolveProvider } from "@/lib/providers";
import { modelUsageThisMonth } from "@/lib/services/admin";
import { getModelConfigs } from "@/lib/services/settings";

export const metadata: Metadata = { title: "모델·가격 · 관리자" };

export default async function AdminModelsPage() {
  const [configs, usage] = await Promise.all([getModelConfigs(), modelUsageThisMonth()]);
  // 함수가 들어 있는 ModelDef는 클라이언트로 못 넘기므로 필요한 값만 추립니다
  const items: AdminModelItem[] = MODELS.map((m) => ({
    id: m.id,
    name: m.name,
    vendor: m.vendor,
    kind: m.kind,
    provider: m.provider,
    tagline: m.tagline,
    gradient: m.gradient,
    prices: m.prices,
    priceNote: m.priceNote ?? null,
    supportsDraft: !!m.supportsDraft,
    resolved: resolveProvider(m, { preferred: configs[m.id]?.provider ?? null }),
    draftResolved: m.supportsDraft ? resolveProvider(m, { preferred: configs[m.id]?.provider ?? null, params: { draft: true } }) : null,
    providers: modelProviders(m).map((p) => ({ id: p, configured: isProviderConfigured(p) })),
    config: configs[m.id] ?? { enabled: true, priceOverrides: {}, notes: null, provider: null },
    usage: usage[m.id] ?? { count: 0, spend: 0, failed: 0 },
  }));
  return <ModelsAdmin items={items} />;
}
