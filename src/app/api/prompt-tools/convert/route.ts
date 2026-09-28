import { z } from "zod";

import { handle, readJson } from "@/lib/api";
import { convertPrompt } from "@/lib/services/prompt-tools";
import { apiUser } from "@/lib/session";

export const maxDuration = 60;

const Body = z.object({ text: z.string().max(8000), target: z.enum(["en", "zh"]) });

/** 한국어 설명 → 영어/중국어 프롬프트 */
export const POST = handle(async (req: Request) => {
  const u = await apiUser();
  const { text, target } = Body.parse(await readJson(req));
  return convertPrompt(u, text, target);
});
