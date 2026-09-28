import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";

import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/lib/env";
import { localPathForKey, verifyLocalSignature } from "@/lib/storage";

/**
 * 로컬 스토리지 드라이버 전용 (개발/사내 서버). S3/R2 사용 시에는 서명된 URL로 직접 접근합니다.
 * 서명(HMAC)으로 보호되며 영상 탐색을 위해 Range 요청을 지원합니다.
 */
const TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
};

function keyOf(parts: string[]): string {
  return parts.map((p) => decodeURIComponent(p)).join("/");
}

function contentDisposition(name: string): string {
  const ascii = name.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ key: string[] }> }) {
  if (env.storage.driver !== "local") return new NextResponse("Not found", { status: 404 });
  const key = keyOf((await ctx.params).key);
  const url = new URL(req.url);
  const exp = Number(url.searchParams.get("exp") ?? 0);
  const sig = url.searchParams.get("sig") ?? "";
  const dl = url.searchParams.get("dl") ?? "";
  if (!exp || exp * 1000 < Date.now() || !verifyLocalSignature(`GET\n${key}\n${exp}\n${dl}`, sig)) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  let file: string;
  let stat;
  try {
    file = localPathForKey(key);
    stat = await fs.stat(file);
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
  const type = TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream";
  const headers: Record<string, string> = {
    "Content-Type": type,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
  };
  if (dl) headers["Content-Disposition"] = contentDisposition(dl);

  const range = req.headers.get("range");
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    if (m) {
      const start = m[1] ? Number(m[1]) : Math.max(0, stat.size - Number(m[2]));
      const end = m[1] && m[2] ? Math.min(Number(m[2]), stat.size - 1) : stat.size - 1;
      if (start <= end && start < stat.size) {
        const stream = Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream;
        return new NextResponse(stream, {
          status: 206,
          headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${stat.size}`, "Content-Length": String(end - start + 1) },
        });
      }
      return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${stat.size}` } });
    }
  }
  const stream = Readable.toWeb(createReadStream(file)) as ReadableStream;
  return new NextResponse(stream, { headers: { ...headers, "Content-Length": String(stat.size) } });
}

const MAX_UPLOAD = 1024 * 1024 * 1024;

export async function PUT(req: NextRequest, ctx: { params: Promise<{ key: string[] }> }) {
  if (env.storage.driver !== "local") return new NextResponse("Not found", { status: 404 });
  const key = keyOf((await ctx.params).key);
  const url = new URL(req.url);
  const exp = Number(url.searchParams.get("exp") ?? 0);
  const sig = url.searchParams.get("sig") ?? "";
  const ct = url.searchParams.get("ct") ?? "";
  if (!exp || exp * 1000 < Date.now() || !verifyLocalSignature(`PUT\n${key}\n${exp}\n${ct}`, sig)) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_UPLOAD) return new NextResponse("Too large", { status: 413 });
  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.length > MAX_UPLOAD) return new NextResponse("Too large", { status: 413 });
  const file = localPathForKey(key);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, buf);
  return new NextResponse(null, { status: 200 });
}
