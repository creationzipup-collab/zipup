import { z } from "zod";

import { handle, readJson } from "@/lib/api";
import { suggestAlternatives } from "@/lib/services/prompt-tools";
import { apiUser } from "@/lib/session";

export const maxDuration = 60;

const Body = z.object({
  prompt: z.string().max(8000),
  src: z.string().min(1).max(1000),
  dst: z.string().max(1000).default(""),
  editedKo: z.string().max(500).nullish(),
  focusKo: z.string().max(200).nullish(),
  count: z.number().int().min(3).max(6).optional(),
});

/** 선택한 구간을 바꿀 표현 3~6개 추천 (한국어 수정 의도 반영) */
export const POST = handle(async (req: Request) => {
  const u = await apiUser();
  return suggestAlternatives(u, Body.parse(await readJson(req)));
});
