import "server-only";

import { db } from "@/lib/db";
import { auditLogs } from "@/lib/db/schema";

export async function audit(
  actorId: string | null,
  action: string,
  target?: { type: string; id: string } | null,
  meta?: Record<string, unknown>,
) {
  try {
    await db.insert(auditLogs).values({
      actorId,
      action,
      targetType: target?.type ?? null,
      targetId: target?.id ?? null,
      meta: meta ?? null,
    });
  } catch (err) {
    console.error("[audit] failed", err);
  }
}
