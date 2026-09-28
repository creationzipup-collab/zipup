import { z } from "zod";

import { handle, readJson } from "@/lib/api";
import { sharePrompt } from "@/lib/services/prompt-docs";
import { apiUser } from "@/lib/session";

const Body = z.object({
  assetId: z.string().uuid(),
  title: z.string().trim().max(80).nullish(),
  note: z.string().trim().max(200).nullish(),
  tags: z.array(z.string().trim().min(1).max(30)).max(10).optional(),
  visibility: z.enum(["team", "company"]).default("team"),
});

/** 클립에서 프롬프트 공유 → 게시판에 썸네일과 함께 올라가요 */
export const POST = handle(async (req: Request) => {
  const u = await apiUser();
  const b = Body.parse(await readJson(req));
  return { item: await sharePrompt(u, b) };
});
