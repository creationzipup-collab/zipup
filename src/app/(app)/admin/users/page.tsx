import type { Metadata } from "next";

import { UsersAdmin } from "@/components/admin/users-admin";
import { listTeams } from "@/lib/services/teams";
import { requireAdminPage } from "@/lib/session";

export const metadata: Metadata = { title: "사용자·승인 · 관리자" };

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const [me, { status }, teams] = await Promise.all([requireAdminPage(), searchParams, listTeams()]);
  const initial = status === "pending" || status === "active" || status === "suspended" ? status : "all";
  return <UsersAdmin initialStatus={initial} teams={teams.map((t) => ({ id: t.id, name: t.name, color: t.color }))} meId={me.id} />;
}
