import { and, count, desc, eq, isNull } from "drizzle-orm";

import { AppShell } from "@/components/shell/app-shell";
import { db } from "@/lib/db";
import { projects, user } from "@/lib/db/schema";
import { visibleProjectsWhere } from "@/lib/services/access";
import { getBudgetStatus } from "@/lib/services/budget";
import { requireActiveUser } from "@/lib/session";
import { env } from "@/lib/env";
import { isProviderConfigured } from "@/lib/providers";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const u = await requireActiveUser();
  const [budget, recent, pendingApprovals] = await Promise.all([
    getBudgetStatus(u),
    db
      .select({ id: projects.id, name: projects.name, color: projects.color, isPersonal: projects.isPersonal })
      .from(projects)
      .where(and(visibleProjectsWhere(u), isNull(projects.archivedAt)))
      .orderBy(desc(projects.lastActivityAt))
      .limit(6),
    u.role === "admin"
      ? db
          .select({ value: count() })
          .from(user)
          .where(eq(user.status, "pending"))
          .then((r) => r[0]?.value ?? 0)
      : Promise.resolve(0),
  ]);
  const mock = env.mockGeneration || !isProviderConfigured("higgsfield") || !isProviderConfigured("fal");
  return (
    <AppShell
      user={{
        id: u.id,
        name: u.name,
        email: u.email,
        image: u.image,
        role: u.role,
        teamName: u.teamName,
        teamColor: u.teamColor,
        pendingApprovals,
      }}
      budget={budget}
      recentProjects={recent}
      mockMode={mock}
    >
      {children}
    </AppShell>
  );
}

