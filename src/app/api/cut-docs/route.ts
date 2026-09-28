import { z } from "zod";

import { handle, readJson } from "@/lib/api";
import { cutDocView, recordCutVersion } from "@/lib/services/cut-docs";
import { apiUser } from "@/lib/session";

const uuid = z.string().uuid();
const Ctx = z.object({
  projectId: uuid,
  cutId: uuid.nullish().transform((v) => v ?? null),
  kind: z.enum(["image", "video"]),
});

/** 이 컷(컷 없으면 프로젝트)의 작업 기록 + 버전별 테이크 */
export const GET = handle(async (req: Request) => {
  const u = await apiUser();
  const p = new URL(req.url).searchParams;
  const ctx = Ctx.parse({ projectId: p.get("projectId"), cutId: p.get("cutId") || null, kind: p.get("kind") });
  return cutDocView(u, ctx);
});

const Save = Ctx.extend({
  prompt: z.string().trim().min(1).max(7000),
  note: z.string().trim().max(200).nullish(),
  modelId: z.string().max(60).nullish(),
  params: z.record(z.string(), z.unknown()).nullish(),
});

/** ⌘S: 이 컷에 버전 저장 (메모와 함께) */
export const POST = handle(async (req: Request) => {
  const u = await apiUser();
  const b = Save.parse(await readJson(req));
  const r = await recordCutVersion(u, b);
  return { docId: r.doc.id, version: r.version.version, created: r.created };
});
