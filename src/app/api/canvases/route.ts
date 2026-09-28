import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { handle, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { canvases, projects, user } from "@/lib/db/schema";
import { ensurePersonalProject, requireProject, visibleProjectsWhere } from "@/lib/services/access";
import { apiUser } from "@/lib/session";

export const GET = handle(async () => {
  const u = await apiUser();
  const rows = await db
    .select({
      id: canvases.id,
      name: canvases.name,
      projectId: canvases.projectId,
      projectName: projects.name,
      updatedAt: canvases.updatedAt,
      createdBy: user.name,
      nodeCount: canvases.graph,
    })
    .from(canvases)
    .innerJoin(projects, eq(projects.id, canvases.projectId))
    .innerJoin(user, eq(user.id, canvases.createdBy))
    .where(and(visibleProjectsWhere(u)))
    .orderBy(desc(canvases.updatedAt))
    .limit(100);
  return {
    items: rows.map((r) => ({ ...r, nodeCount: Array.isArray(r.nodeCount?.nodes) ? r.nodeCount.nodes.length : 0 })),
  };
});

const Body = z.object({
  projectId: z.string().uuid().nullish(),
  name: z.string().trim().min(1).max(80).default("새 캔버스"),
  template: z.enum(["blank", "image-to-video", "character-sheet"]).default("image-to-video"),
});

/** 템플릿: 프롬프트 → 이미지 → 영상 */
function templateGraph(t: string) {
  if (t === "blank") return { nodes: [], edges: [] };
  if (t === "character-sheet") {
    return {
      nodes: [
        { id: "p1", type: "prompt", position: { x: 0, y: 80 }, data: { text: "귀여운 3D 마스코트 캐릭터, 흰 배경, 스튜디오 조명" } },
        { id: "i1", type: "imageInput", position: { x: 0, y: 330 }, data: {} },
        { id: "g1", type: "imageGen", position: { x: 380, y: 60 }, data: { modelId: "nano-banana-pro", params: { aspectRatio: "1:1", resolution: "2K" }, count: 2, text: "정면" } },
        { id: "g2", type: "imageGen", position: { x: 820, y: 60 }, data: { modelId: "nano-banana-pro", params: { aspectRatio: "1:1", resolution: "2K" }, count: 2, text: "측면, 같은 캐릭터" } },
      ],
      edges: [
        { id: "e1", source: "p1", sourceHandle: "text", target: "g1", targetHandle: "prompt" },
        { id: "e2", source: "i1", sourceHandle: "image", target: "g1", targetHandle: "refs" },
        { id: "e3", source: "p1", sourceHandle: "text", target: "g2", targetHandle: "prompt" },
        { id: "e4", source: "g1", sourceHandle: "image", target: "g2", targetHandle: "refs" },
      ],
    };
  }
  return {
    nodes: [
      { id: "p1", type: "prompt", position: { x: 0, y: 120 }, data: { text: "비 오는 밤 네온 거리의 인물, 시네마틱 35mm" } },
      { id: "g1", type: "imageGen", position: { x: 380, y: 40 }, data: { modelId: "seedream-5-pro", params: { aspectRatio: "16:9", resolution: "2K" }, count: 1 } },
      { id: "v1", type: "videoGen", position: { x: 820, y: 40 }, data: { modelId: "seedance-2-5", params: { draft: true, duration: 5 }, text: "카메라가 천천히 다가간다" } },
      { id: "n1", type: "note", position: { x: 0, y: 360 }, data: { text: "① 프롬프트를 적고\n② 이미지 노드 ▶ 실행\n③ 마음에 드는 컷을 고른 뒤 영상 노드 ▶ 실행\n\n상단 '전체 실행'으로 한 번에 돌릴 수도 있어요." } },
    ],
    edges: [
      { id: "e1", source: "p1", sourceHandle: "text", target: "g1", targetHandle: "prompt" },
      { id: "e2", source: "g1", sourceHandle: "image", target: "v1", targetHandle: "start" },
    ],
  };
}

export const POST = handle(async (req: Request) => {
  const u = await apiUser();
  const b = Body.parse(await readJson(req));
  const project = b.projectId ? (await requireProject(u, b.projectId, "editor")).project : await ensurePersonalProject(u);
  const [item] = await db
    .insert(canvases)
    .values({ projectId: project.id, name: b.name, graph: templateGraph(b.template), createdBy: u.id, updatedBy: u.id })
    .returning();
  return { item };
});
