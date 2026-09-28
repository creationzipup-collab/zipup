import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Studio } from "@/components/studio/studio";
import { requireActiveUser } from "@/lib/session";
import { editableProjects, getModelStatus, studioPrefill } from "@/lib/services/studio";

export async function generateMetadata({ params }: { params: Promise<{ kind: string }> }): Promise<Metadata> {
  const { kind } = await params;
  return { title: kind === "video" ? "영상 생성" : "이미지 생성" };
}

export default async function CreatePage({
  params,
  searchParams,
}: {
  params: Promise<{ kind: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { kind } = await params;
  if (kind !== "image" && kind !== "video") notFound();
  const u = await requireActiveUser();
  const sp = await searchParams;
  const [status, projects, prefill] = await Promise.all([
    getModelStatus(),
    editableProjects(u),
    studioPrefill(u, kind, sp),
  ]);
  return (
    <Studio
      key={`${kind}-${sp.from ?? ""}-${sp.ref ?? ""}-${sp.start ?? ""}-${sp.preset ?? ""}`}
      kind={kind}
      status={status}
      projects={projects}
      prefill={prefill}
    />
  );
}
