import { eq } from "drizzle-orm";
import { after } from "next/server";
import { z } from "zod";

import { handle, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { assets, user } from "@/lib/db/schema";
import { refreshSearchText } from "@/lib/services/assets";
import { apiUser } from "@/lib/session";

const Patch = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  jobTitle: z.string().trim().max(40).nullable().optional(),
});

/** 내 프로필 수정 (이름·직함) */
export const PATCH = handle(async (req: Request) => {
  const u = await apiUser();
  const b = Patch.parse(await readJson(req));
  const set: Partial<typeof user.$inferInsert> = {};
  if (b.name !== undefined) set.name = b.name;
  if (b.jobTitle !== undefined) set.jobTitle = b.jobTitle || null;
  if (!Object.keys(set).length) return { ok: true };
  await db.update(user).set(set).where(eq(user.id, u.id));
  if (b.name !== undefined && b.name !== u.name) {
    // 검색 텍스트에 만든 사람 이름이 들어 있으므로 백그라운드에서 갱신
    after(async () => {
      const rows = await db.select({ id: assets.id }).from(assets).where(eq(assets.userId, u.id)).limit(5000);
      for (let i = 0; i < rows.length; i += 200) await refreshSearchText(rows.slice(i, i + 200).map((r) => r.id));
    });
  }
  return { ok: true };
});
