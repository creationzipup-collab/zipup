import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { teams, user } from "@/lib/db/schema";
import { ensurePersonalProject } from "@/lib/services/access";
import { audit } from "@/lib/services/audit";
import { notifyAdmins } from "@/lib/services/notifications";

/** 회원가입 직후 처리 */
export async function onUserSignedUp(userId: string) {
  const [u] = await db.select().from(user).where(eq(user.id, userId)).limit(1);
  if (!u) return;
  if (u.status === "active") {
    // 최초 관리자(부트스트랩)
    await db.update(user).set({ approvedAt: new Date() }).where(eq(user.id, u.id));
    await ensurePersonalProject(u);
    await audit(u.id, "user.bootstrap_admin", { type: "user", id: u.id });
    return;
  }
  let teamName: string | null = null;
  if (u.requestedTeamId) {
    const t = await db.select({ name: teams.name }).from(teams).where(eq(teams.id, u.requestedTeamId)).limit(1);
    teamName = t[0]?.name ?? null;
  }
  await notifyAdmins({
    type: "signup_pending",
    title: `${u.name}님이 가입 승인을 기다리고 있어요`,
    body: `${u.email}${teamName ? ` · 희망 팀: ${teamName}` : ""}`,
    href: "/admin/users?status=pending",
  });
  await audit(u.id, "user.signup", { type: "user", id: u.id }, { email: u.email, requestedTeamId: u.requestedTeamId });
}
