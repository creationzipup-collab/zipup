import { and, asc, eq, ilike, or } from "drizzle-orm";

import { handle } from "@/lib/api";
import { db } from "@/lib/db";
import { teams, user } from "@/lib/db/schema";
import { popularTags } from "@/lib/services/selection";
import { listTeams } from "@/lib/services/teams";
import { apiUser } from "@/lib/session";

/** 사람·팀·태그 목록 (멤버 초대, 필터 자동완성용) */
export const GET = handle(async (req: Request) => {
  await apiUser();
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  const pat = `%${q}%`;
  const [people, teamRows, tagRows] = await Promise.all([
    db
      .select({ id: user.id, name: user.name, email: user.email, image: user.image, teamName: teams.name })
      .from(user)
      .leftJoin(teams, eq(teams.id, user.teamId))
      .where(and(eq(user.status, "active"), q ? or(ilike(user.name, pat), ilike(user.email, pat)) : undefined))
      .orderBy(asc(user.name))
      .limit(50),
    listTeams(),
    popularTags(40),
  ]);
  return {
    people,
    teams: teamRows.map((t) => ({ id: t.id, name: t.name, color: t.color })),
    tags: tagRows,
  };
});
