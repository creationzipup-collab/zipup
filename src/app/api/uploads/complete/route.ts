import { z } from "zod";

import { handle, readJson } from "@/lib/api";
import { badRequest, forbidden } from "@/lib/errors";
import { ensurePersonalProject, requireProject } from "@/lib/services/access";
import { assetUrls, storeAsset } from "@/lib/services/assets";
import { storage } from "@/lib/storage";
import { apiUser, canGenerate } from "@/lib/session";
import { UPLOAD_TYPES } from "@/lib/uploads";

export const maxDuration = 120;

const Body = z.object({
  key: z.string().min(1).max(500),
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1),
  projectId: z.string().uuid().nullish(),
  cutId: z.string().uuid().nullish(),
});

export const POST = handle(async (req: Request) => {
  const u = await apiUser();
  if (!canGenerate(u)) throw forbidden("뷰어 권한은 업로드할 수 없어요.");
  const body = Body.parse(await readJson(req));
  if (!body.key.startsWith(`uploads/${u.id}/`)) throw forbidden();
  const type = UPLOAD_TYPES[body.contentType];
  if (!type || type.kind === "audio") throw badRequest("지원하지 않는 파일 형식이에요.");
  const project = body.projectId
    ? (await requireProject(u, body.projectId, "editor")).project
    : await ensurePersonalProject(u);
  let buffer: Buffer;
  try {
    buffer = await storage().get(body.key);
  } catch {
    throw badRequest("업로드된 파일을 찾을 수 없어요. 다시 시도해 주세요.");
  }
  const asset = await storeAsset({
    buffer,
    contentType: body.contentType,
    kind: type.kind,
    source: "upload",
    projectId: project.id,
    userId: u.id,
    teamId: u.teamId,
    originalName: body.filename,
    existingKey: body.key,
    cutId: body.cutId ?? null,
  });
  return {
    asset: {
      id: asset.id,
      kind: asset.kind,
      filename: asset.filename,
      width: asset.width,
      height: asset.height,
      durationSec: asset.durationSec,
      projectId: asset.projectId,
      urls: await assetUrls(asset),
    },
  };
});
