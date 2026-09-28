import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProjectView } from "@/components/projects/project-view";
import { db } from "@/lib/db";
import { assets } from "@/lib/db/schema";
import { HttpError } from "@/lib/errors";
import { assetUrls } from "@/lib/services/assets";
import { projectOverview } from "@/lib/services/projects";
import { requireActiveUser } from "@/lib/session";

export const metadata: Metadata = { title: "프로젝트" };

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; collection?: string }> }) {
  const u = await requireActiveUser();
  const { id } = await params;
  const sp = await searchParams;
  let data;
  try {
    data = await projectOverview(u, id);
  } catch (e) {
    if (e instanceof HttpError && (e.status === 404 || e.status === 403)) notFound();
    throw e;
  }
  let cover: { kind: "image" | "video"; urls: { thumb: string; src: string; download: string } } | null = null;
  if (data.project.coverAssetId) {
    const [a] = await db.select().from(assets).where(eq(assets.id, data.project.coverAssetId));
    if (a) cover = { kind: a.kind, urls: await assetUrls(a) };
  }
  return (
    <ProjectView
      data={data}
      cover={cover}
      initialTab={sp.tab ?? "assets"}
      initialCollection={sp.collection ?? null}
      canChooseTeam={u.role === "admin" || u.role === "manager"}
    />
  );
}
