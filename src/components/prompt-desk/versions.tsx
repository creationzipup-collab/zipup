"use client";

import { useQueryClient } from "@tanstack/react-query";
import { BookmarkPlus, Check, GitCompareArrows, History, Undo2 } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { toast } from "sonner";

import { VERDICT_STYLE } from "@/components/assets/selection-controls";
import { DiffBadge } from "@/components/prompt-desk/diff-view";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { TimeAgo } from "@/components/ui/misc";
import { getModel } from "@/lib/models/registry";
import type { CutDocView } from "@/lib/services/cut-docs";
import type { Visibility } from "@/lib/types";
import { cn, fetchJson } from "@/lib/utils";

export type { CutDocView };

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

export type CutDocCtx = { projectId: string; cutId: string | null; kind: "image" | "video"; label: string };

/** ⌘S — 이 컷에 버전 저장 (메모와 함께) */
export function CutVersionDialog({
  open,
  onOpenChange,
  ctx,
  nextVersion,
  text,
  modelId,
  params,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ctx: CutDocCtx;
  nextVersion: number;
  text: string;
  modelId: string;
  params: Record<string, unknown>;
  onSaved: (version: number, text: string) => void;
}) {
  const qc = useQueryClient();
  const [note, setNote] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [wasOpen, setWasOpen] = React.useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) setNote("");
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setSaving(true);
    try {
      const r = await fetchJson<{ version: number; created: boolean }>("/api/cut-docs", {
        method: "POST",
        body: JSON.stringify({ projectId: ctx.projectId, cutId: ctx.cutId, kind: ctx.kind, prompt: text, note: note.trim() || null, modelId, params }),
      });
      toast.success(r.created ? `${ctx.label} v${r.version}로 저장했어요.` : `${ctx.label} v${r.version}과 같은 내용이에요.`, {
        description: r.created ? "이 컷 안에서만 버전이 올라가요." : note.trim() ? "메모를 붙였어요." : undefined,
      });
      void qc.invalidateQueries({ queryKey: ["cut-doc"] });
      onSaved(r.version, text);
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm" title={`${ctx.label} · v${nextVersion} 저장`} description="이 컷 안에서만 버전이 올라가요. 생성할 때 바뀐 프롬프트는 자동으로도 저장돼요.">
        <form onSubmit={save}>
          <DialogBody className="flex flex-col gap-4">
            <Field label="이번 버전에서 바꾼 점" hint="선택 · 버전 기록에 표시돼요">
              <Input autoFocus value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="예: 조명을 림라이트로, 배경을 더 어둡게" />
            </Field>
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

/** 라이브러리 ‘저장’에 넣기 — 다른 컷·프로젝트에서도 꺼내 쓰고, 동료에게 보낼 수 있어요 */
export function SaveToLibraryDialog({
  open,
  onOpenChange,
  text,
  kind,
  modelId,
  params,
  defaultTitle,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  text: string;
  kind: "image" | "video";
  modelId: string;
  params: Record<string, unknown>;
  defaultTitle?: string;
}) {
  const qc = useQueryClient();
  const [title, setTitle] = React.useState("");
  const [tags, setTags] = React.useState("");
  const [withSettings, setWithSettings] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [wasOpen, setWasOpen] = React.useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) {
      setTitle(defaultTitle ?? text.replace(/\s+/g, " ").slice(0, 36));
      setTags("");
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setSaving(true);
    try {
      const r = await fetchJson<{ item: { id: string; title: string } }>("/api/prompts", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim() || "제목 없는 프롬프트",
          prompt: text,
          kind,
          modelId: withSettings ? modelId : null,
          params: withSettings ? params : null,
          tags: tags
            .split(/[,\s]+/)
            .map((t) => t.replace(/^#/, "").trim())
            .filter(Boolean)
            .slice(0, 10),
        }),
      });
      toast.success(`‘${r.item.title}’을(를) 라이브러리에 저장했어요.`, {
        action: { label: "열기", onClick: () => window.open(`/prompts?tab=saved&open=${r.item.id}`, "_self") },
      });
      void qc.invalidateQueries({ queryKey: ["prompt-library"] });
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm" title="라이브러리에 저장" description="라이브러리 ‘저장’에 들어가요. 다른 컷에서 꺼내 쓰거나 동료에게 보낼 수 있어요.">
        <form onSubmit={save}>
          <DialogBody className="flex flex-col gap-4">
            <Field label="제목">
              <Input autoFocus value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="예: 제품 누끼 · 스튜디오 조명" />
            </Field>
            <Field label="태그" hint="쉼표나 공백으로 구분">
              <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="광고, 제품, 시네마틱" />
            </Field>
            <label className="flex items-center gap-2 text-[12.5px] text-fg-2">
              <input type="checkbox" checked={withSettings} onChange={(e) => setWithSettings(e.target.checked)} className="accent-[var(--accent)]" />
              모델·설정도 함께 저장
            </label>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              취소
            </Button>
            <Button type="submit" variant="primary" loading={saving} disabled={!text.trim()}>
              {!saving && <BookmarkPlus />} 저장
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type Version = CutDocView["versions"][number];

/** 이 컷의 버전 기록 — 버전마다 그 버전으로 나온 테이크 (불러오기·비교) */
export function VersionList({
  view,
  loading,
  label,
  baseVersion,
  currentText,
  compareVersion,
  onLoad,
  onCompare,
}: {
  view: CutDocView | undefined;
  loading: boolean;
  label: string;
  baseVersion: number | null;
  currentText: string;
  compareVersion: number | null;
  onLoad: (v: Version) => void;
  onCompare: (v: Version) => void;
}) {
  if (loading) {
    return (
      <div className="flex flex-col gap-1.5">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="skeleton h-16 rounded-xl" />
        ))}
      </div>
    );
  }
  if (!view?.doc || !view.versions.length) {
    return (
      <div className="corners corners-dashed flex flex-col items-start gap-2 rounded-xl p-4">
        <span className="flex size-8 items-center justify-center rounded-full border border-dashed border-line-3 text-fg-3">
          <History className="size-4" />
        </span>
        <p className="text-[13.5px] font-medium">{label}에 아직 버전이 없어요</p>
        <p className="text-[12.5px] leading-relaxed text-fg-3">
          생성하면 그때의 프롬프트가 v1로 남고, 바꿔서 다시 생성할 때마다 버전이 올라가요.{" "}
          <kbd className="rounded border border-line-2 px-1 font-mono text-[11px]">⌘S</kbd>로 메모와 함께 저장할 수도 있어요. 버전은 이 컷 안에서만 쌓여요.
        </p>
      </div>
    );
  }
  const latest = view.versions[0]?.version ?? 0;
  const base = baseVersion ?? latest;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 px-1 pb-1 text-[11.5px] text-fg-4">
        <span className="font-medium text-fg-3">{label}</span>
        <span>· {view.versions.length}개 버전</span>
        <span className="ml-auto">이 컷 안에서만 쌓여요</span>
      </div>
      <ol className="relative flex flex-col gap-1 before:absolute before:bottom-4 before:left-[19px] before:top-4 before:w-px before:bg-line-2">
        {view.versions.map((v) => {
          const isBase = v.version === base;
          const model = v.modelId ? getModel(v.modelId) : null;
          return (
            <li
              key={v.id}
              className={cn("relative flex items-start gap-3 rounded-xl px-2 py-2.5 transition hover:bg-white/[0.03]", compareVersion === v.version && "bg-white/[0.04] ring-1 ring-line-3")}
            >
              <span
                className={cn(
                  "z-10 flex h-6 min-w-[38px] items-center justify-center rounded-full border font-mono text-[11px]",
                  isBase ? "border-accent bg-accent text-on-accent shadow-[0_0_12px_-2px_var(--accent-glow)]" : "border-line-2 bg-bg-2 text-fg-2",
                )}
              >
                v{v.version}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[12.5px]">
                  <span className={cn("truncate", v.note ? "text-fg-2" : "text-fg-4")}>{v.note || (v.takeCount ? "생성할 때 자동 저장" : "메모 없음")}</span>
                  <DiffBadge from={v.prompt} to={currentText} className="ml-auto shrink-0" />
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-fg-4">
                  {v.authorName ?? "알 수 없음"} · <TimeAgo date={v.createdAt} />
                  {model && <span>· {model.shortName}</span>}
                  {isBase && <span className="text-accent">· 지금 기준</span>}
                </div>
                {v.takes.length > 0 && (
                  <div className="mt-2 flex items-center gap-1">
                    {v.takes.map((t) => (
                      <Link key={t.id} href={`/library?asset=${t.id}`} className="relative block h-9 w-12 overflow-hidden rounded-[5px] bg-panel-3 ring-1 ring-white/[0.06] transition hover:ring-white/25" title={t.take ? `T${String(t.take).padStart(2, "0")}` : undefined}>
                        {t.kind === "image" ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={t.thumb} alt="" loading="lazy" className="size-full object-cover" />
                        ) : (
                          <video src={`${t.src}#t=0.1`} muted preload="metadata" className="size-full object-cover" />
                        )}
                        {t.flag && <span className={cn("absolute inset-x-0 bottom-0 h-[2px]", VERDICT_STYLE[t.flag].solid)} />}
                      </Link>
                    ))}
                    {v.takeCount > v.takes.length && <span className="pl-1 font-mono text-[10.5px] text-fg-4">+{v.takeCount - v.takes.length}</span>}
                  </div>
                )}
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
