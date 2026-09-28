import type { Metadata } from "next";

import { ProjectsView } from "@/components/projects/projects-view";
import { listProjects } from "@/lib/services/projects";
import { getSettings } from "@/lib/services/settings";
import { requireActiveUser } from "@/lib/session";

export const metadata: Metadata = { title: "프로젝트" };

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ new?: string; archived?: string }> }) {
  const u = await requireActiveUser();
  const sp = await searchParams;
  const archived = sp.archived === "1";
  const [items, settings] = await Promise.all([listProjects(u, { archived }), getSettings()]);
  return (
    <ProjectsView
      items={items}
      archived={archived}
      openNew={sp.new === "1"}
      canCreate={u.role !== "viewer"}
      canChooseTeam={u.role === "admin" || u.role === "manager"}
      myTeamId={u.teamId}
      defaultVisibility={settings.defaultVisibility}
    />
  );
}
