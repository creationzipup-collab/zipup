import type { Metadata } from "next";

import { SettingsAdmin } from "@/components/admin/settings-admin";
import { getSettings } from "@/lib/services/settings";

export const metadata: Metadata = { title: "설정 · 관리자" };

export default async function AdminSettingsPage() {
  const settings = await getSettings();
  return <SettingsAdmin initial={settings} />;
}
