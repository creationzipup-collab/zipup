import { handle } from "@/lib/api";
import { listUsers } from "@/lib/services/admin";
import { apiAdmin } from "@/lib/session";

export const GET = handle(async (req: Request) => {
  await apiAdmin();
  const p = new URL(req.url).searchParams;
  const status = p.get("status");
  return listUsers({
    status: status === "pending" || status === "active" || status === "suspended" ? status : "all",
    q: p.get("q") ?? undefined,
  });
});
