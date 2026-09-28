import { and, count, eq, gte, sql } from "drizzle-orm";
import type { Metadata } from "next";

import { AccountSettings } from "@/components/settings/account-settings";
import { db } from "@/lib/db";
import { assets, favorites, generations } from "@/lib/db/schema";
import { monthStartKst } from "@/lib/money";
import { getBudgetStatus } from "@/lib/services/budget";
import { getSettings } from "@/lib/services/settings";
import { requireActiveUser } from "@/lib/session";

export const metadata: Metadata = { title: "설정" };

export default async function SettingsPage() {
  const u = await requireActiveUser();
  const since = monthStartKst();
  const [budget, settings, [gen], [up], [fav]] = await Promise.all([
    getBudgetStatus(u),
    getSettings(),
    db
      .select({
        images: sql<number>`count(*) filter (where ${generations.kind} = 'image')::int`,
        videos: sql<number>`count(*) filter (where ${generations.kind} = 'video')::int`,
      })
      .from(generations)
      .where(and(eq(generations.userId, u.id), gte(generations.createdAt, since))),
    db
      .select({ n: count() })
      .from(assets)
      .where(and(eq(assets.userId, u.id), eq(assets.source, "upload"), gte(assets.createdAt, since))),
    db.select({ n: count() }).from(favorites).where(eq(favorites.userId, u.id)),
  ]);
  return (
    <AccountSettings
      me={{ name: u.name, email: u.email, image: u.image, jobTitle: u.jobTitle, role: u.role, teamName: u.teamName, teamColor: u.teamColor }}
      budget={budget}
      stats={{ images: gen?.images ?? 0, videos: gen?.videos ?? 0, uploads: up?.n ?? 0, favorites: fav?.n ?? 0 }}
      warnPercent={settings.budgetWarnPercent}
    />
  );
}
