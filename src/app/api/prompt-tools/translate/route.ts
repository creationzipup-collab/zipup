import { z } from "zod";

import { handle, readJson } from "@/lib/api";
import { translatePrompt } from "@/lib/services/prompt-tools";
import { apiUser } from "@/lib/session";

export const maxDuration = 60;

const Body = z.object({ text: z.string().max(8000) });

/** 영어·중국어 프롬프트 → 한국어 직역 (구간별 대응) */
export const POST = handle(async (req: Request) => {
  const u = await apiUser();
  const { text } = Body.parse(await readJson(req));
  return translatePrompt(u, text);
});
