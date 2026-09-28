import { z } from "zod";

import { handle, readJson } from "@/lib/api";
import { createPresetWithVersion, libraryList, type LibraryTab } from "@/lib/services/prompt-docs";
import { apiUser } from "@/lib/session";

const TABS: LibraryTab[] = ["saved", "inbox", "team", "sent"];

/** 프롬프트 라이브러리: ?tab=saved(저장) | inbox(받은) | team(팀·전사) | sent(보낸) */
export const GET = handle(async (req: Request) => {
  const u = await apiUser();
  const p = new URL(req.url).searchParams;
  const tab = TABS.includes(p.get("tab") as LibraryTab) ? (p.get("tab") as LibraryTab) : "saved";
  return libraryList(u, { tab, q: p.get("q") ?? "", kind: p.get("kind") ?? undefined });
});

const Body = z.object({
  title: z.string().trim().min(1).max(80),
  prompt: z.string().trim().min(1).max(7000),
  kind: z.enum(["image", "video", "any"]).default("any"),
  modelId: z.string().max(60).nullish(),
  params: z.record(z.string(), z.unknown()).nullish(),
  tags: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
  visibility: z.enum(["private", "team", "company"]).default("private"),
  note: z.string().trim().max(200).nullish(),
});

/** 라이브러리에 저장 (v1 버전과 함께). 다른 사람에게 보내려면 /api/prompts/share */
export const POST = handle(async (req: Request) => {
  const u = await apiUser();
  const b = Body.parse(await readJson(req));
  const { preset, version } = await createPresetWithVersion(u, b);
  return { item: preset, version: version.version };
});
