import "server-only";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { teams, user } from "@/lib/db/schema";
import { forbidden, unauthorized } from "@/lib/errors";

export type CurrentUser = typeof user.$inferSelect & {
  teamName: string | null;
  teamColor: string | null;
};

/** 현재 로그인한 사용자 (DB 최신 상태). 요청당 1회만 조회합니다. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const s = await auth.api.getSession({ headers: await headers() });
  if (!s) return null;
  const rows = await db
    .select({ u: user, teamName: teams.name, teamColor: teams.color })
    .from(user)
    .leftJoin(teams, eq(teams.id, user.teamId))
    .where(eq(user.id, s.user.id))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return { ...row.u, teamName: row.teamName, teamColor: row.teamColor };
});

/** 페이지용: 로그인·승인 상태에 따라 리다이렉트 */
export async function requireActiveUser(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  if (u.status === "pending") redirect("/pending");
  if (u.status === "suspended") redirect("/suspended");
  return u;
}

export async function requireAdminPage(): Promise<CurrentUser> {
  const u = await requireActiveUser();
  if (u.role !== "admin") redirect("/");
  return u;
}

/** API/서버 액션용: 예외를 던집니다 */
export async function apiUser(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) throw unauthorized();
  if (u.status !== "active") throw forbidden("관리자 승인 후 이용할 수 있어요.");
  return u;
}

export async function apiAdmin(): Promise<CurrentUser> {
  const u = await apiUser();
  if (u.role !== "admin") throw forbidden("관리자만 할 수 있어요.");
  return u;
}

export function canGenerate(u: Pick<CurrentUser, "role" | "status">): boolean {
  return u.status === "active" && u.role !== "viewer";
}
