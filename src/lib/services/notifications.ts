import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { notifications, user } from "@/lib/db/schema";

export type NotifyInput = {
  type:
    | "signup_pending"
    | "account_approved"
    | "generation_completed"
    | "generation_failed"
    | "mention"
    | "comment"
    | "project_invite"
    | "budget_warning"
    | "budget_exceeded";
  title: string;
  body?: string;
  href?: string;
};

export async function notify(userIds: string | string[], input: NotifyInput) {
  const ids = Array.from(new Set(Array.isArray(userIds) ? userIds : [userIds])).filter(Boolean);
  if (!ids.length) return;
  await db.insert(notifications).values(
    ids.map((userId) => ({
      userId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      href: input.href ?? null,
    })),
  );
}

export async function adminIds(): Promise<string[]> {
  const rows = await db
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.role, "admin"), eq(user.status, "active")));
  return rows.map((r) => r.id);
}

export async function notifyAdmins(input: NotifyInput) {
  await notify(await adminIds(), input);
}

export async function markRead(userId: string, ids?: string[]) {
  const where = ids?.length
    ? and(eq(notifications.userId, userId), inArray(notifications.id, ids))
    : eq(notifications.userId, userId);
  await db.update(notifications).set({ readAt: new Date() }).where(where);
}
