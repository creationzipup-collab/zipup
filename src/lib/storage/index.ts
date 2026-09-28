import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { env } from "@/lib/env";

import { createSupabaseDriver } from "./supabase";
import type { StorageDriver } from "./types";

export type { SignedUrlOptions, StorageDriver } from "./types";

const HOUR = 3600;

function contentDisposition(name: string): string {
  const ascii = name.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/* --------------------------------- S3 / R2 -------------------------------- */

function createS3Driver(): StorageDriver {
  const c = env.storage.s3;
  const client = new S3Client({
    region: c.region,
    endpoint: c.endpoint,
    forcePathStyle: c.forcePathStyle,
    credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey },
  });
  const bucket = c.bucket;
  const signingDate = () => new Date(Math.floor(Date.now() / (HOUR * 1000)) * HOUR * 1000);

  return {
    kind: "s3",
    async put(key, body, contentType) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          CacheControl: "private, max-age=31536000, immutable",
        }),
      );
    },
    async get(key) {
      const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const bytes = await res.Body!.transformToByteArray();
      return Buffer.from(bytes);
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
    async signedGetUrl(key, opts = {}) {
      const cmd = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        ResponseContentDisposition: opts.downloadName ? contentDisposition(opts.downloadName) : undefined,
      });
      // 서명 시각을 1시간 단위로 고정 → 같은 시간대에는 같은 URL (브라우저 캐시 적중)
      return getSignedUrl(client, cmd, { expiresIn: (opts.expiresIn ?? 2 * HOUR) + HOUR, signingDate: signingDate() });
    },
    async signedPutUrl(key, contentType, expiresIn = 15 * 60) {
      const cmd = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType });
      const url = await getSignedUrl(client, cmd, { expiresIn });
      return { url, headers: { "Content-Type": contentType } };
    },
  };
}

/* ---------------------------------- Local --------------------------------- */

// 로컬 저장소는 개발용. 경로가 동적이라 번들 추적에서 제외 (운영은 Supabase Storage 또는 S3/R2 사용)
function localRoot(): string {
  return path.resolve(/*turbopackIgnore: true*/ process.cwd(), env.storage.localDir);
}

function safeLocalPath(key: string): string {
  const root = localRoot();
  const full = path.resolve(/*turbopackIgnore: true*/ root, key);
  if (!full.startsWith(root + path.sep)) throw new Error("잘못된 파일 경로");
  return full;
}

function sign(payload: string): string {
  return createHmac("sha256", env.authSecret ?? "dev").update(payload).digest("base64url");
}

export function verifyLocalSignature(payload: string, sig: string): boolean {
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

function createLocalDriver(): StorageDriver {
  return {
    kind: "local",
    async put(key, body) {
      const file = safeLocalPath(key);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, body);
    },
    async get(key) {
      return fs.readFile(safeLocalPath(key));
    },
    async delete(key) {
      await fs.rm(safeLocalPath(key), { force: true });
    },
    async signedGetUrl(key, opts = {}) {
      const bucket = Math.floor(Date.now() / (HOUR * 1000)) * HOUR;
      const exp = bucket + (opts.expiresIn ?? 2 * HOUR) + HOUR;
      const dl = opts.downloadName ?? "";
      const sig = sign(`GET\n${key}\n${exp}\n${dl}`);
      const qs = new URLSearchParams({ exp: String(exp), sig });
      if (dl) qs.set("dl", dl);
      return `/api/files/${key.split("/").map(encodeURIComponent).join("/")}?${qs.toString()}`;
    },
    async signedPutUrl(key, contentType, expiresIn = 15 * 60) {
      const exp = Math.floor(Date.now() / 1000) + expiresIn;
      const sig = sign(`PUT\n${key}\n${exp}\n${contentType}`);
      const qs = new URLSearchParams({ exp: String(exp), sig, ct: contentType });
      return {
        url: `/api/files/${key.split("/").map(encodeURIComponent).join("/")}?${qs.toString()}`,
        headers: { "Content-Type": contentType },
      };
    },
  };
}

export function localPathForKey(key: string): string {
  return safeLocalPath(key);
}

let driver: StorageDriver | null = null;

export function storage(): StorageDriver {
  if (!driver) {
    const kind = env.storage.driver;
    if (kind === "local" && process.env.VERCEL) {
      // Vercel 함수의 디스크는 읽기 전용·일회성이라 결과물을 보관할 수 없음
      throw new Error("파일 저장소가 설정되지 않았어요. Supabase(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) 또는 R2(S3_*) 환경 변수를 확인해 주세요.");
    }
    if (kind === "supabase") {
      const { url, key, bucket } = env.storage.supabase;
      if (!url || !key) throw new Error("SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY가 필요해요.");
      driver = createSupabaseDriver({ url, key, bucket });
    } else {
      driver = kind === "s3" ? createS3Driver() : createLocalDriver();
    }
  }
  return driver;
}

/** 확장자 추정 */
export function extFromContentType(ct: string | undefined, fallback: string): string {
  const map: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "video/webm": "webm",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/mpeg": "mp3",
  };
  return (ct && map[ct.split(";")[0].trim().toLowerCase()]) || fallback;
}
