import { and, desc, ilike, isNull, or, sql } from "drizzle-orm";

import { handle } from "@/lib/api";
import { db } from "@/lib/db";
import { projects, tags, user } from "@/lib/db/schema";
import { visibleProjectsWhere } from "@/lib/services/access";
import { searchAssets } from "@/lib/services/library";
import { apiUser } from "@/lib/session";

/** ⌘K 빠른 검색: 프로젝트 · 에셋 · 태그 · 사람 */
export const GET = handle(async (req: Request) => {
  const u = await apiUser();
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (!q) return { projects: [], assets: [], tags: [], people: [] };
  const pat = `%${q.replace(/[\\%_]/g, (m) => "\\" + m)}%`;
  const [projectRows, assetRes, tagRows, peopleRows] = await Promise.all([
    db
      .select({ id: projects.id, name: projects.name, color: projects.color, isPersonal: projects.isPersonal })
      .from(projects)
      .where(and(visibleProjectsWhere(u), isNull(projects.archivedAt), or(ilike(projects.name, pat), ilike(projects.description, pat))))
      .orderBy(desc(projects.lastActivityAt))
      .limit(5),
    searchAssets(u, { q, limit: 8, sort: "relevance" }),
    db
      .select({ name: tags.name })
      .from(tags)
      .where(ilike(tags.name, pat))
      .orderBy(sql`length(${tags.name})`)
      .limit(5),
    db
      .select({ id: user.id, name: user.name, email: user.email })
      .from(user)
      .where(and(sql`${user.status} = 'active'`, or(ilike(user.name, pat), ilike(user.email, pat))))
      .limit(5),
  ]);
  return {
    projects: projectRows,
    assets: assetRes.items.map((a) => ({ id: a.id, filename: a.filename, kind: a.kind, thumb: a.urls.thumb, prompt: a.prompt, projectName: a.projectName })),
    tags: tagRows.map((t) => t.name),
    people: peopleRows,
  };
});
