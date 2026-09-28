"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Check, GitCompareArrows, History, Link2, Lock, Globe, Users, Undo2 } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { DiffBadge } from "@/components/prompt-desk/diff-view";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/controls";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { TimeAgo } from "@/components/ui/misc";
import { type PromptVersionDTO, usePromptVersions } from "@/lib/client/prompt-tools";
import type { Visibility } from "@/lib/types";
import { cn, fetchJson } from "@/lib/utils";

export type DeskDoc = {
  id: string;
  title: string;
  version: number;
  visibility: Visibility;
  canAddVersion: boolean;
  /** 저장된(불러온) 버전의 내용 — 변경 비교의 기준 */
  baseText: string;
  /** 불러온 버전 번호 (없으면 최신) */
  baseVersion?: number;
};

const VIS: { value: Visibility; label: React.ReactNode }[] = [
  { value: "private", label: <span className="flex items-center gap-1"><Lock className="size-3" /> 나만</span> },
  { value: "team", label: <span className="flex items-center gap-1"><Users className="size-3" /> 우리 팀</span> },
  { value: "company", label: <span className="flex items-center gap-1"><Globe className="size-3" /> 전사</span> },
];

export function shareUrl(id: string) {
  return `${window.location.origin}/prompts/${id}`;
}

export async function copyShareLink(id: string) {
  try {
    await navigator.clipboard.writeText(shareUrl(id));
    toast.success("공유 링크를 복사했어요.", { description: "공개 범위 안의 동료가 열어서 버전·변경점을 볼 수 있어요." });
  } catch {
    toast.error("클립보드에 복사하지 못했어요.");
  }
}

export function SaveVersionDialog({
  open,
  onOpenChange,
  doc,
  text,
  kind,
  modelId,
  params,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  doc: DeskDoc | null;
  text: string;
  kind: "image" | "video";
  modelId: string;
  params: Record<string, unknown>;
  onSaved: (doc: DeskDoc) => void;
}) {
  const qc = useQueryClient();
  const [asNew, setAsNew] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [note, setNote] = React.useState("");
  const [visibility, setVisibility] = React.useState<Visibility>("private");
  const [saving, setSaving] = React.useState(false);
  const [wasOpen, setWasOpen] = React.useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) {
      setAsNew(!doc || !doc.canAddVersion);
      setTitle(doc ? `${doc.title} (사본)` : text.replace(/\s+/g, " ").slice(0, 36));
      setNote("");
      setVisibility(doc?.visibility ?? "private");
    }
  }
  const creating = asNew || !doc;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setSaving(true);
    try {
      if (creating) {
        const r = await fetchJson<{ item: { id: string; title: string; visibility: Visibility }; version: number }>("/api/prompts", {
          method: "POST",
          body: JSON.stringify({ title: title.trim() || "제목 없는 프롬프트", prompt: text, kind, modelId, params, visibility, note: note.trim() || null }),
        });
        onSaved({ id: r.item.id, title: r.item.title, version: r.version, visibility: r.item.visibility, canAddVersion: true, baseText: text });
        toast.success(`'${r.item.title}' v1로 저장했어요.`, { action: { label: "링크 복사", onClick: () => copyShareLink(r.item.id) } });
      } else {
        const r = await fetchJson<{ version: number }>(`/api/prompts/${doc.id}/versions`, {
          method: "POST",
          body: JSON.stringify({ prompt: text, note: note.trim() || null, modelId, params }),
        });
        onSaved({ ...doc, version: r.version, baseText: text });
        toast.success(`v${r.version}로 저장했어요.`, { action: { label: "링크 복사", onClick: () => copyShareLink(doc.id) } });
      }
      void qc.invalidateQueries({ queryKey: ["prompt-versions"] });
      void qc.invalidateQueries({ queryKey: ["prompts"] });
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm" title={creating ? "프롬프트 저장" : `새 버전 저장 · v${(doc?.version ?? 0) + 1}`} description={creating ? "버전별로 기록돼요. 저장만 하면 프롬프트 게시판에는 올라가지 않아요 — 올리려면 결과 클립에서 '공유'를 누르세요." : doc?.title}>
        <form onSubmit={save}>
          <DialogBody className="flex flex-col gap-4">
            {doc && doc.canAddVersion && (
              <Segmented
                value={asNew ? "new" : "version"}
                onChange={(v) => setAsNew(v === "new")}
                options={[
                  { value: "version", label: `v${doc.version + 1}로 저장` },
                  { value: "new", label: "새 프롬프트로" },
                ]}
              />
            )}
            {creating && (
              <Field label="제목">
                <Input autoFocus value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="예: 제품 누끼 · 스튜디오 조명" />
              </Field>
            )}
            <Field label="이번 버전에서 바꾼 점" hint="선택 · 버전 기록에 표시돼요">
              <Input autoFocus={!creating} value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="예: 조명을 림라이트로, 배경을 더 어둡게" />
            </Field>
            {creating && (
              <Field label="함께 다듬기" hint="팀 공개로 두면 팀원이 링크로 열어 새 버전을 더할 수 있어요 (게시판에는 안 올라가요)">
                <Segmented value={visibility} onChange={setVisibility} options={VIS} />
              </Field>
            )}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              취소
            </Button>
            <Button type="submit" variant="primary" loading={saving} disabled={!text.trim()}>
              {!saving && <Check />} 저장
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** 버전 기록 (불러오기·비교) */
export function VersionList({
  doc,
  currentText,
  compareVersion,
  onLoad,
  onCompare,
}: {
  doc: DeskDoc | null;
  currentText: string;
  compareVersion: number | null;
  onLoad: (v: PromptVersionDTO) => void;
  onCompare: (v: PromptVersionDTO) => void;
}) {
  const { data = [], isLoading } = usePromptVersions(doc?.id);
  if (!doc) {
    return (
      <div className="flex flex-col items-start gap-2 rounded-xl border border-dashed border-line-2 p-4">
        <span className="flex size-8 items-center justify-center rounded-lg bg-panel-2 text-fg-3">
          <History className="size-4" />
        </span>
        <p className="text-[13.5px] font-medium">아직 저장하지 않은 프롬프트예요</p>
        <p className="text-[12.5px] leading-relaxed text-fg-3">
          <kbd className="rounded border border-line-2 px-1 font-mono text-[11px]">⌘S</kbd> 로 저장하면 v1, v2… 버전이 쌓이고, 버전끼리 달라진 부분을 색으로 비교할 수 있어요.
        </p>
      </div>
    );
  }
  if (isLoading) {
    return (
      <div className="flex flex-col gap-1.5">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="skeleton h-14 rounded-xl" />
        ))}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 px-1 pb-1 text-[11.5px] text-fg-4">
        <span className="font-medium text-fg-3">{doc.title}</span>
        <span>· {data.length}개 버전</span>
        <button type="button" onClick={() => copyShareLink(doc.id)} className="ml-auto flex items-center gap-1 hover:text-fg-2">
          <Link2 className="size-3.5" /> 링크 복사
        </button>
      </div>
      <ol className="relative flex flex-col gap-1 before:absolute before:bottom-3 before:left-[19px] before:top-3 before:w-px before:bg-line-2">
        {data.map((v) => {
          const isBase = v.version === doc.version;
          return (
            <li
              key={v.id}
              className={cn("relative flex items-start gap-3 rounded-xl px-2 py-2 transition hover:bg-panel-2/70", compareVersion === v.version && "bg-panel-2 ring-1 ring-line-3")}
            >
              <span
                className={cn(
                  "z-10 flex h-6 min-w-[38px] items-center justify-center rounded-full border font-mono text-[11px]",
                  isBase ? "border-accent bg-accent text-[#0a0a0a]" : "border-line-2 bg-bg-2 text-fg-2",
                )}
              >
                v{v.version}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[12.5px]">
                  <span className="truncate text-fg-2">{v.note || (v.version === 1 ? "처음 저장" : "메모 없음")}</span>
                  <DiffBadge from={v.prompt} to={currentText} className="ml-auto shrink-0" />
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-fg-4">
                  {v.authorName ?? "알 수 없음"} · <TimeAgo date={v.createdAt} />
                  {isBase && <span className="text-accent">· 지금 기준</span>}
                </div>
                <div className="mt-1.5 flex gap-1">
                  <Button variant="ghost" size="xs" onClick={() => onCompare(v)}>
                    <GitCompareArrows /> 지금과 비교
                  </Button>
                  <Button variant="ghost" size="xs" onClick={() => onLoad(v)}>
                    <Undo2 /> 이 버전 불러오기
                  </Button>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
