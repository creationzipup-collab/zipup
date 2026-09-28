import { z } from "zod";

import { handle, readJson } from "@/lib/api";
import { suggestWords } from "@/lib/services/translate";
import { apiUser } from "@/lib/session";

export const maxDuration = 30;

const Body = z.object({
  ko: z.string().min(1).max(200),
  original: z.string().max(120).nullish(),
  target: z.enum(["en", "zh"]).optional(),
});

/** 한국어로 적은 뜻 → 프롬프트에 넣을 영어(중국어) 표현 후보 */
export const POST = handle(async (req: Request) => {
  const u = await apiUser();
  return suggestWords(u, Body.parse(await readJson(req)));
});
