import type { Metadata } from "next";

import { TeamsAdmin } from "@/components/admin/teams-admin";
import { listTeamsAdmin } from "@/lib/services/admin";
import { getSettings } from "@/lib/services/settings";
import { ensureDefaultTeams } from "@/lib/services/teams";

export const metadata: Metadata = { title: "팀·예산 · 관리자" };

export default async function AdminTeamsPage() {
  await ensureDefaultTeams();
  const [teams, settings] = await Promise.all([listTeamsAdmin(), getSettings()]);
  return <TeamsAdmin teams={teams} warnPercent={settings.budgetWarnPercent} />;
}
