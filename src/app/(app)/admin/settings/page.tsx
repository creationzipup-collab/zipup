import type { Metadata } from "next";

import { SettingsAdmin } from "@/components/admin/settings-admin";
import { DEFAULT_FAL_LLM_MODEL, LLM_MODEL_PRESETS, llmProvider } from "@/lib/llm";
import { getSettings } from "@/lib/services/settings";

export const metadata: Metadata = { title: "설정 · 관리자" };

export default async function AdminSettingsPage() {
  const settings = await getSettings();
  return <SettingsAdmin initial={settings} llm={{ provider: llmProvider(), presets: LLM_MODEL_PRESETS, defaultModel: DEFAULT_FAL_LLM_MODEL }} />;
}
