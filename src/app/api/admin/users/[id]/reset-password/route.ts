import type { NextRequest } from "next/server";

import { handle } from "@/lib/api";
import { resetPasswordAdmin } from "@/lib/services/admin";
import { apiAdmin } from "@/lib/session";

export const POST = handle(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const admin = await apiAdmin();
  return resetPasswordAdmin(admin, (await ctx.params).id);
});
