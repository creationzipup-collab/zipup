import type { NextRequest } from "next/server";

import { handle } from "@/lib/api";
import { notFound } from "@/lib/errors";
import { assetDetail } from "@/lib/services/library";
import { apiUser } from "@/lib/session";

export const GET = handle(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const u = await apiUser();
  const { id } = await ctx.params;
  const item = await assetDetail(u, id);
  if (!item) throw notFound("파일을 찾을 수 없어요.");
  return item;
});
