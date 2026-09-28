import { z } from "zod";

import { handle, readJson } from "@/lib/api";
import { createProject, listProjects } from "@/lib/services/projects";
import { apiUser } from "@/lib/session";

export const GET = handle(async (req: Request) => {
  const u = await apiUser();
  const p = new URL(req.url).searchParams;
  return { items: await listProjects(u, { archived: p.get("archived") === "1", q: p.get("q") ?? undefined }) };
});

const Body = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().max(500).nullish(),
  visibility: z.enum(["private", "team", "company"]).optional(),
  color: z.string().max(20).nullish(),
  teamId: z.string().uuid().nullish(),
  memberIds: z.array(z.string()).max(100).optional(),
});

export const POST = handle(async (req: Request) => {
  const u = await apiUser();
  const b = Body.parse(await readJson(req));
  const p = await createProject(u, { ...b, teamId: b.teamId === undefined ? undefined : b.teamId });
  return { item: p };
});
