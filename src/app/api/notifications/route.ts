import { and, count, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { handle, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import { markRead } from "@/lib/services/notifications";
import { apiUser } from "@/lib/session";

export const GET = handle(async () => {
  const u = await apiUser();
  const [items, [{ value: unread }]] = await Promise.all([
    db.select().from(notifications).where(eq(notifications.userId, u.id)).orderBy(desc(notifications.createdAt)).limit(30),
    db
      .select({ value: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, u.id), isNull(notifications.readAt))),
  ]);
  return { items, unread };
});

const Body = z.object({ ids: z.array(z.string().uuid()).optional() });

export const POST = handle(async (req: Request) => {
  const u = await apiUser();
  const { ids } = Body.parse(await readJson(req));
  await markRead(u.id, ids);
  return { ok: true };
});
