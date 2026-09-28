import type { Metadata } from "next";

import { PromptsView } from "@/components/prompts/prompts-view";
import { requireActiveUser } from "@/lib/session";

export const metadata: Metadata = { title: "프롬프트" };

export default async function PromptsPage() {
  const u = await requireActiveUser();
  return <PromptsView isAdmin={u.role === "admin"} />;
}
