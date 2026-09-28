import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ResultsWindow } from "@/components/popout/results-window";
import { requireActiveUser } from "@/lib/session";
import { getModelStatus } from "@/lib/services/studio";

export const metadata: Metadata = { title: "결과 창" };

/** 듀얼 모니터용 결과 창 (사이드바 없이 결과만) */
export default async function ResultsPopoutPage({ params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (kind !== "image" && kind !== "video") notFound();
  await requireActiveUser();
  const status = await getModelStatus();
  return <ResultsWindow kind={kind} status={status} />;
}
