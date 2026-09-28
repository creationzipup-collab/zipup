import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PromptDocView } from "@/components/prompts/prompt-doc-view";
import { HttpError } from "@/lib/errors";
import { listVersions, loadPreset, presetDoc } from "@/lib/services/prompt-docs";
import { requireActiveUser } from "@/lib/session";

type Props = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f-]{36}$/i;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  if (!UUID.test(id)) return { title: "프롬프트" };
  try {
    const u = await requireActiveUser();
    const p = await loadPreset(u, id);
    return { title: `${p.title} · 프롬프트` };
  } catch {
    return { title: "프롬프트" };
  }
}

export default async function PromptDocPage({ params }: Props) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const u = await requireActiveUser();
  let preset;
  try {
    preset = await loadPreset(u, id);
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) notFound();
    throw e;
  }
  const [doc, versions] = await Promise.all([presetDoc(u, preset), listVersions(preset.id)]);
  return <PromptDocView doc={doc} versions={versions} modelId={preset.modelId} />;
}
