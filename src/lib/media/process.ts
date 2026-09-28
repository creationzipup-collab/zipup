import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";

import sharp from "sharp";

import { env } from "@/lib/env";

import { parseMp4 } from "./mp4";

export type Downloaded = { buffer: Buffer; contentType: string };

const MAX_BYTES = 1024 * 1024 * 1024; // 1GB

/** 결과물 다운로드 (mock:// 스킴은 로컬에서 생성) */
export async function downloadOutput(url: string, fallbackType: string): Promise<Downloaded> {
  if (url.startsWith("mock://")) return mockMedia(url);
  const res = await fetch(url, { signal: AbortSignal.timeout(240_000), cache: "no-store" });
  if (!res.ok) throw new Error(`결과물 다운로드 실패 (HTTP ${res.status})`);
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > MAX_BYTES) throw new Error("결과물이 너무 커요.");
  const buffer = Buffer.from(await res.arrayBuffer());
  const contentType = (res.headers.get("content-type") ?? fallbackType).split(";")[0].trim();
  return {
    buffer,
    contentType:
      contentType === "application/octet-stream" || contentType === "binary/octet-stream" ? fallbackType : contentType,
  };
}

export type MediaMeta = { width?: number; height?: number; durationSec?: number };

export async function imageMeta(buffer: Buffer): Promise<MediaMeta> {
  const m = await sharp(buffer, { failOn: "none" }).metadata();
  const rotated = (m.orientation ?? 1) >= 5;
  return { width: rotated ? m.height : m.width, height: rotated ? m.width : m.height };
}

export function videoMeta(buffer: Buffer): MediaMeta {
  return parseMp4(buffer);
}

/** 갤러리용 썸네일 (WebP, 긴 변 768px) */
export async function makeThumbnail(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer, { failOn: "none" })
    .rotate()
    .resize({ width: 768, height: 768, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
}

/* ---------------------------------- Mock ---------------------------------- */

const PALETTES = [
  ["#0b0b10", "#ff5b24", "#3a2cff"],
  ["#0e1116", "#7cf7ff", "#ff7cd9"],
  ["#101010", "#d7ff3a", "#1f6f5a"],
  ["#140b0b", "#ffb347", "#8b1e3f"],
  ["#07121f", "#4c8dff", "#b9e2ff"],
  ["#120d1a", "#a974ff", "#ffd1f0"],
];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

async function mockMedia(url: string): Promise<Downloaded> {
  const u = new URL(url.replace("mock://", "http://mock/"));
  if (u.pathname === "/video") {
    const ratio = u.searchParams.get("ratio") ?? "16:9";
    const file = ratio === "9:16" || ratio === "3:4" ? "mock-9x16.mp4" : ratio === "1:1" ? "mock-1x1.mp4" : "mock-16x9.mp4";
    try {
      return { buffer: await fs.readFile(path.join(process.cwd(), "public", "mock", file)), contentType: "video/mp4" };
    } catch {
      const res = await fetch(`${env.appUrl}/mock/${file}`);
      return { buffer: Buffer.from(await res.arrayBuffer()), contentType: "video/mp4" };
    }
  }
  const w = Number(u.searchParams.get("w") ?? 1024);
  const h = Number(u.searchParams.get("h") ?? 1024);
  const seed = u.searchParams.get("seed") ?? "x";
  const hv = hash(seed);
  const [bg, a, b] = PALETTES[hv % PALETTES.length];
  const cx = 20 + (hv % 60);
  const cy = 20 + ((hv >> 8) % 60);
  const r = Math.min(w, h);
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <radialGradient id="g1" cx="${cx}%" cy="${cy}%" r="75%">
      <stop offset="0%" stop-color="${a}" stop-opacity="0.95"/>
      <stop offset="55%" stop-color="${b}" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="${bg}" stop-opacity="1"/>
    </radialGradient>
    <linearGradient id="g2" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.10"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.35"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="${bg}"/>
  <rect width="100%" height="100%" fill="url(#g1)"/>
  <circle cx="${w * ((100 - cx) / 100)}" cy="${h * ((100 - cy) / 100)}" r="${r * 0.22}" fill="${b}" opacity="0.35"/>
  <circle cx="${w * 0.5}" cy="${h * 0.55}" r="${r * 0.32}" fill="none" stroke="#ffffff" stroke-opacity="0.12" stroke-width="${Math.max(2, r * 0.004)}"/>
  <rect width="100%" height="100%" fill="url(#g2)"/>
  <text x="${w * 0.05}" y="${h * 0.93}" font-family="monospace" font-size="${Math.round(r * 0.028)}" fill="#ffffff" fill-opacity="0.55" letter-spacing="2">ZIPUP AI · MOCK ${seed.toUpperCase()}</text>
</svg>`;
  const buffer = await sharp(Buffer.from(svg)).png({ compressionLevel: 8 }).toBuffer();
  return { buffer, contentType: "image/png" };
}
