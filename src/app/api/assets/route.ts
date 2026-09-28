import { z } from "zod";

import { handle, readJson } from "@/lib/api";
import { searchAssets } from "@/lib/services/library";
import { purgeAssets, updateAssets } from "@/lib/services/selection";
import { apiUser } from "@/lib/session";

const list = (v: string | null) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : undefined);

export const GET = handle(async (req: Request) => {
  const u = await apiUser();
  const p = new URL(req.url).searchParams;
  const kind = p.get("kind");
  const sort = p.get("sort");
  return searchAssets(u, {
    q: p.get("q") ?? undefined,
    projectId: p.get("projectId") ?? undefined,
    collectionId: p.get("collectionId") ?? undefined,
    kind: kind === "image" || kind === "video" ? kind : undefined,
    models: list(p.get("models")),
    minRating: p.get("minRating") ? Number(p.get("minRating")) : undefined,
    flags: list(p.get("flags")) as ("pick" | "reject" | "none")[] | undefined,
    colors: list(p.get("colors")) as never,
    tags: list(p.get("tags")),
    mine: p.get("mine") === "1",
    favorites: p.get("favorites") === "1",
    trash: p.get("trash") === "1",
    sort: sort === "oldest" || sort === "rating" || sort === "relevance" ? sort : "newest",
    offset: Number(p.get("offset") ?? 0),
    limit: Number(p.get("limit") ?? 60),
  });
});

const PatchSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
  patch: z.object({
    rating: z.number().int().min(0).max(5).optional(),
    flag: z.enum(["pick", "reject"]).nullable().optional(),
    colorLabel: z.enum(["red", "orange", "yellow", "green", "blue", "purple"]).nullable().optional(),
    addTags: z.array(z.string().min(1).max(40)).max(20).optional(),
    removeTags: z.array(z.string().min(1).max(40)).max(20).optional(),
    favorite: z.boolean().optional(),
    projectId: z.string().uuid().optional(),
    deleted: z.boolean().optional(),
  }),
});

export const PATCH = handle(async (req: Request) => {
  const u = await apiUser();
  const { ids, patch } = PatchSchema.parse(await readJson(req));
  return updateAssets(u, ids, patch);
});

const DeleteSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(500) });

/** 휴지통에서 영구 삭제 */
export const DELETE = handle(async (req: Request) => {
  const u = await apiUser();
  const { ids } = DeleteSchema.parse(await readJson(req));
  return purgeAssets(u, ids);
});
