import "server-only";

import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { assets, favorites, projectMembers, projects, user } from "@/lib/db/schema";
import { MODELS } from "@/lib/models/registry";
import { resolveProvider } from "@/lib/providers";
import { atLeast, computeAccess, ensurePersonalProject, visibleProjectsWhere } from "@/lib/services/access";
import { assetDetail, toListItems } from "@/lib/services/library";
import { getModelConfigs } from "@/lib/services/settings";
import type { CurrentUser } from "@/lib/session";

export type ModelStatusMap = Record<
  string,
  { enabled: boolean; provider: "higgsfield" | "fal" | "mock" | null; priceOverrides: Record<string, number> }
>;

export async function getModelStatus(): Promise<ModelStatusMap> {
  const configs = await getModelConfigs();
  const out: ModelStatusMap = {};
  for (const m of MODELS) {
    const c = configs[m.id];
    out[m.id] = { enabled: c?.enabled ?? true, provider: resolveProvider(m), priceOverrides: c?.priceOverrides ?? {} };
  }
  return out;
}

export type EditableProject = { id: string; name: string; isPersonal: boolean; color: string | null };

/** 사용자가 생성물을 저장할 수 있는 프로젝트 (개인 작업공간 먼저) */
export async function editableProjects(u: CurrentUser): Promise<EditableProject[]> {
  const personal = await ensurePersonalProject(u);
  const rows = await db
    .select({ p: projects, memberRole: projectMembers.role })
    .from(projects)
    .leftJoin(projectMembers, and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, u.id)))
    .where(and(visibleProjectsWhere(u), isNull(projects.archivedAt), eq(projects.isPersonal, false)))
    .orderBy(desc(projects.lastActivityAt))
    .limit(100);
  const editable = rows
    .filter((r) => atLeast(computeAccess(u, r.p, r.memberRole ?? null), "editor"))
    .map((r) => ({ id: r.p.id, name: r.p.name, isPersonal: false, color: r.p.color }));
  return [{ id: personal.id, name: personal.name, isPersonal: true, color: null }, ...editable];
}

type RefItem = {
  id: string;
  kind: "image" | "video";
  filename: string;
  width: number | null;
  height: number | null;
  durationSec: number | null;
  urls: { thumb: string; src: string; download: string };
};

export type StudioPrefill = {
  modelId?: string;
  prompt?: string;
  params?: Record<string, unknown>;
  count?: number;
  projectId?: string;
  inputs?: { images: RefItem[]; startFrame?: RefItem; endFrame?: RefItem; videos: RefItem[] };
};

async function refItems(u: CurrentUser, ids: string[]): Promise<RefItem[]> {
  if (!ids.length) return [];
  const rows = await db
    .select({
      a: assets,
      projectName: projects.name,
      userName: user.name,
      isFavorite: sql<boolean>`exists(select 1 from ${favorites} where ${favorites.userId} = ${u.id} and ${favorites.assetId} = ${assets.id})`,
    })
    .from(assets)
    .innerJoin(projects, eq(projects.id, assets.projectId))
    .innerJoin(user, eq(user.id, assets.userId))
    .where(and(inArray(assets.id, ids), visibleProjectsWhere(u)));
  const items = await toListItems(rows);
  return ids
    .map((id) => items.find((i) => i.id === id))
    .filter(Boolean)
    .map((i) => ({ id: i!.id, kind: i!.kind, filename: i!.filename, width: i!.width, height: i!.height, durationSec: i!.durationSec, urls: i!.urls }));
}

export async function studioPrefill(
  u: CurrentUser,
  kind: "image" | "video",
  sp: { from?: string; ref?: string; start?: string; model?: string; prompt?: string; project?: string },
): Promise<StudioPrefill> {
  const out: StudioPrefill = {};
  if (sp.model && MODELS.some((m) => m.id === sp.model && m.kind === kind)) out.modelId = sp.model;
  if (sp.prompt) out.prompt = sp.prompt.slice(0, 5000);
  if (sp.project) out.projectId = sp.project;

  if (sp.from) {
    const d = await assetDetail(u, sp.from);
    if (d?.generation) {
      const g = d.generation;
      const inputs = g.inputs as { images?: string[]; startFrame?: string; endFrame?: string; videos?: string[] };
      const all = await refItems(u, [...(inputs.images ?? []), ...(inputs.videos ?? []), ...(inputs.startFrame ? [inputs.startFrame] : []), ...(inputs.endFrame ? [inputs.endFrame] : [])]);
      const byId = new Map(all.map((a) => [a.id, a]));
      out.modelId = g.modelId;
      out.prompt = g.prompt;
      out.params = g.params;
      out.projectId = d.projectId;
      out.inputs = {
        images: (inputs.images ?? []).map((id) => byId.get(id)!).filter(Boolean),
        videos: (inputs.videos ?? []).map((id) => byId.get(id)!).filter(Boolean),
        startFrame: inputs.startFrame ? byId.get(inputs.startFrame) : undefined,
        endFrame: inputs.endFrame ? byId.get(inputs.endFrame) : undefined,
      };
    }
  }
  if (sp.ref || sp.start) {
    const [ref] = sp.ref ? await refItems(u, [sp.ref]) : [];
    const [start] = sp.start ? await refItems(u, [sp.start]) : [];
    const inputs = out.inputs ?? { images: [], videos: [] };
    if (ref?.kind === "image") inputs.images = [...inputs.images, ref];
    if (ref?.kind === "video") {
      inputs.videos = [ref, ...inputs.videos];
      out.modelId = out.modelId ?? "seedance-2-5";
      out.params = { ...(out.params ?? {}), task: "edit" };
    }
    if (start?.kind === "image") inputs.startFrame = start;
    out.inputs = inputs;
  }
  return out;
}
