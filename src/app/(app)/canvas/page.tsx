import type { Metadata } from "next";

import { CanvasList } from "@/components/canvas/canvas-list";
import { editableProjects } from "@/lib/services/studio";
import { requireActiveUser } from "@/lib/session";

export const metadata: Metadata = { title: "노드 캔버스" };

export default async function CanvasIndexPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const u = await requireActiveUser();
  const sp = await searchParams;
  const projects = await editableProjects(u);
  return <CanvasList projects={projects} openNew={sp.new === "1"} canCreate={u.role !== "viewer"} />;
}
