import { z } from "zod";

import { handle } from "@/lib/api";
import { lookupWord } from "@/lib/services/translate";
import { apiUser } from "@/lib/session";

export const maxDuration = 30;

const Query = z.object({ q: z.string().min(1).max(60), lang: z.enum(["en", "zh"]).default("en") });

/** 단어·짧은 표현의 한국어 뜻 (용어집 → 사전 → 번역 API → AI, 회사 공용 캐시) */
export const GET = handle(async (req: Request) => {
  const u = await apiUser();
  const url = new URL(req.url);
  const { q, lang } = Query.parse({ q: url.searchParams.get("q") ?? "", lang: url.searchParams.get("lang") ?? undefined });
  return lookupWord(u, q, lang);
});
