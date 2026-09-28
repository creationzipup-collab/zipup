import { randomUUID } from "node:crypto";

import { z } from "zod";

import { handle, readJson } from "@/lib/api";
import { badRequest, forbidden } from "@/lib/errors";
import { UPLOAD_TYPES } from "@/lib/uploads";
import { extFromContentType, storage } from "@/lib/storage";
import { apiUser, canGenerate } from "@/lib/session";


const Body = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1),
  size: z.number().int().positive(),
});

/** 업로드용 서명 URL 발급 → 브라우저가 스토리지로 직접 PUT → /api/uploads/complete */
export const POST = handle(async (req: Request) => {
  const u = await apiUser();
  if (!canGenerate(u)) throw forbidden("뷰어 권한은 업로드할 수 없어요.");
  const body = Body.parse(await readJson(req));
  const type = UPLOAD_TYPES[body.contentType];
  if (!type) throw badRequest("지원하지 않는 파일 형식이에요. (PNG, JPG, WebP, GIF, MP4, MOV, WebM)");
  if (body.size > type.max) throw badRequest(`파일이 너무 커요. 최대 ${Math.round(type.max / 1024 / 1024)}MB까지 올릴 수 있어요.`);
  const ext = extFromContentType(body.contentType, "bin");
  const key = `uploads/${u.id}/${new Date().toISOString().slice(0, 7)}/${randomUUID()}.${ext}`;
  const { url, headers } = await storage().signedPutUrl(key, body.contentType);
  return { key, url, headers, method: "PUT" };
});
