import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CanvasEditor } from "@/components/canvas/canvas-editor";
import { db } from "@/lib/db";
import { canvases } from "@/lib/db/schema";
import { getProjectAccess } from "@/lib/services/access";
import { getModelStatus } from "@/lib/services/studio";
import { requireActiveUser } from "@/lib/session";

export const metadata: Metadata = { title: "노드 캔버스" };

export default async function CanvasPage({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireActiveUser();
  const { id } = await params;
  const [c] = await db.select().from(canvases).where(eq(canvases.id, id));
  if (!c) notFound();
  const { project, level } = await getProjectAccess(u, c.projectId);
  if (!project || level === "none") notFound();
  const status = await getModelStatus();
  return (
    <CanvasEditor
      canvas={{
        id: c.id,
        name: c.name,
        projectId: c.projectId,
        projectName: project.name,
        graph: c.graph as never,
      }}
      canEdit={(level === "owner" || level === "editor") && u.role !== "viewer"}
      status={status}
    />
  );
}
