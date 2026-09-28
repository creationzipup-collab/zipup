import "server-only";

import { db } from "@/lib/db";
import { appSettings, modelSettings } from "@/lib/db/schema";
import { MODELS } from "@/lib/models/registry";
import type { Visibility } from "@/lib/types";

export type AppSettings = {
  /** 자동 파일명 템플릿 */
  filenameTemplate: string;
  /** 공급자별 동시 실행 한도 (Higgsfield 계정 한도에 맞춰 조정) */
  concurrency: { higgsfield: number; fal: number; mock: number };
  defaultVisibility: Visibility;
  /** 회원가입 허용 */
  allowSignup: boolean;
  /** 가입 허용 이메일 도메인 (비어 있으면 제한 없음) */
  signupDomains: string[];
  /** 예산 경고 기준(%) */
  budgetWarnPercent: number;
};

export const DEFAULT_SETTINGS: AppSettings = {
  filenameTemplate: "{project}_{model}_{date}_{seq}",
  concurrency: { higgsfield: 4, fal: 8, mock: 6 },
  defaultVisibility: "team",
  allowSignup: true,
  signupDomains: [],
  budgetWarnPercent: 80,
};

let cache: { at: number; value: AppSettings } | null = null;
const TTL = 15_000;

export async function getSettings(): Promise<AppSettings> {
  if (cache && Date.now() - cache.at < TTL) return cache.value;
  const rows = await db.select().from(appSettings);
  const merged: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) {
    if (r.key in DEFAULT_SETTINGS) {
      const def = DEFAULT_SETTINGS[r.key as keyof AppSettings];
      merged[r.key] =
        typeof def === "object" && !Array.isArray(def) && def !== null
          ? { ...(def as object), ...(r.value as object) }
          : r.value;
    }
  }
  const value = merged as AppSettings;
  cache = { at: Date.now(), value };
  return value;
}

export async function updateSettings(patch: Partial<AppSettings>, userId: string) {
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in DEFAULT_SETTINGS) || value === undefined) continue;
    await db
      .insert(appSettings)
      .values({ key, value, updatedBy: userId })
      .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedBy: userId } });
  }
  cache = null;
}

export type ModelConfig = {
  enabled: boolean;
  priceOverrides: Record<string, number>;
  notes: string | null;
};

let modelCache: { at: number; value: Record<string, ModelConfig> } | null = null;

export async function getModelConfigs(): Promise<Record<string, ModelConfig>> {
  if (modelCache && Date.now() - modelCache.at < TTL) return modelCache.value;
  const rows = await db.select().from(modelSettings);
  const out: Record<string, ModelConfig> = {};
  for (const m of MODELS) out[m.id] = { enabled: true, priceOverrides: {}, notes: null };
  for (const r of rows) {
    out[r.modelId] = { enabled: r.enabled, priceOverrides: r.priceOverrides ?? {}, notes: r.notes };
  }
  modelCache = { at: Date.now(), value: out };
  return out;
}

export async function updateModelConfig(modelId: string, patch: Partial<ModelConfig>, userId: string) {
  const current = (await getModelConfigs())[modelId] ?? { enabled: true, priceOverrides: {}, notes: null };
  const next = { ...current, ...patch };
  await db
    .insert(modelSettings)
    .values({ modelId, enabled: next.enabled, priceOverrides: next.priceOverrides, notes: next.notes, updatedBy: userId })
    .onConflictDoUpdate({
      target: modelSettings.modelId,
      set: { enabled: next.enabled, priceOverrides: next.priceOverrides, notes: next.notes, updatedBy: userId },
    });
  modelCache = null;
}

export async function getSetting<K extends keyof AppSettings>(key: K): Promise<AppSettings[K]> {
  return (await getSettings())[key];
}

export async function clearSettingsCache() {
  cache = null;
  modelCache = null;
}

