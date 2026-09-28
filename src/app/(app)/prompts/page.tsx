import type { Metadata } from "next";

import type { LibraryTab } from "@/components/prompts/library";
import { PromptsView } from "@/components/prompts/prompts-view";
import { libraryTabFor } from "@/lib/services/prompt-docs";
import { requireActiveUser } from "@/lib/session";

export const metadata: Metadata = { title: "프롬프트 라이브러리" };

const TABS: LibraryTab[] = ["saved", "inbox", "team", "sent"];

export default async function PromptsPage({ searchParams }: { searchParams: Promise<{ tab?: string; open?: string }> }) {
  const u = await requireActiveUser();
  const sp = await searchParams;
  const tab = TABS.includes(sp.tab as LibraryTab) ? (sp.tab as LibraryTab) : sp.open ? await libraryTabFor(u, sp.open).catch(() => "saved" as const) : "saved";
  return <PromptsView key={`${tab}-${sp.open ?? ""}`} isAdmin={u.role === "admin"} initialTab={tab} initialOpen={sp.open ?? null} />;
}
