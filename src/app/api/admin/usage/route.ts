import { handle } from "@/lib/api";
import { monthStartKst } from "@/lib/money";
import { usageStats } from "@/lib/services/admin";
import { apiAdmin } from "@/lib/session";

export const GET = handle(async (req: Request) => {
  await apiAdmin();
  const range = new URL(req.url).searchParams.get("range") ?? "month";
  const now = new Date();
  const until = new Date(now.getTime() + 60_000);
  const days = range === "7d" ? 7 : range === "30d" ? 30 : range === "90d" ? 90 : null;
  const since = days ? new Date(now.getTime() - days * 86400_000) : monthStartKst(now);
  return usageStats({ since, until });
});
