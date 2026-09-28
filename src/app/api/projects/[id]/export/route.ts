import type { NextRequest } from "next/server";

import { handle } from "@/lib/api";
import { exportList } from "@/lib/services/cuts";
import { apiUser } from "@/lib/session";

type Ctx = { params: Promise<{ id: string }> };

const VERDICTS = new Set(["pick", "reject", "keep", "none"]);

/** 내보내기 목록 (?cutId=…&verdicts=pick,keep) — 압축은 브라우저에서 */
export const GET = handle(async (req: NextRequest, ctx: Ctx) => {
  const u = await apiUser();
  const p = new URL(req.url).searchParams;
  const verdicts = (p.get("verdicts") ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter((v) => VERDICTS.has(v)) as ("pick" | "reject" | "keep" | "none")[];
  return exportList(u, { projectId: (await ctx.params).id, cutId: p.get("cutId"), verdicts });
});
