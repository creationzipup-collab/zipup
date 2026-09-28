"use client";

import { ArrowLeft, Check, Clapperboard, Copy, Globe, ImagePlus, Link2, Lock, Pencil, Trash2, Users } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { BilingualPanel } from "@/components/prompt-desk/bilingual-panel";
import { DiffBadge, DiffView } from "@/components/prompt-desk/diff-view";
import { copyShareLink } from "@/components/prompt-desk/versions";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Segmented } from "@/components/ui/controls";
import { Input } from "@/components/ui/input";
import { Avatar, TimeAgo } from "@/components/ui/misc";
import { type PromptDocDTO, type PromptVersionDTO, useTranslation } from "@/lib/client/prompt-tools";
import { getModel } from "@/lib/models/registry";
import { type Visibility, VISIBILITY_LABEL } from "@/lib/types";
import { cn, fetchJson } from "@/lib/utils";

const VIS_ICON: Record<Visibility, React.ElementType> = { private: Lock, team: Users, company: Globe };

/** 공유된 프롬프트: 최신 내용 · 한국어 대조 · 버전별 변경점 */
export function PromptDocView({ doc, versions, modelId }: { doc: PromptDocDTO; versions: PromptVersionDTO[]; modelId: string | null }) {
  const router = useRouter();
  const latest = versions[0];
  const [selected, setSelected] = React.useState<number>(latest?.version ?? 1);
  const current = versions.find((v) => v.version === selected) ?? latest;
  const prev = versions.find((v) => v.version === (current?.version ?? 0) - 1);
  const [mode, setMode] = React.useState<"diff" | "text">("diff");
  const [editingTitle, setEditingTitle] = React.useState(false);
  const [title, setTitle] = React.useState(doc.title);
  const [confirm, confirmDialog] = useConfirm();
  const tr = useTranslation(current?.prompt ?? "", true);
  const VisIcon = VIS_ICON[doc.visibility];
  const model = modelId ? getModel(modelId) : null;
  const targets: ("image" | "video")[] = doc.kind === "any" ? ["image", "video"] : [doc.kind];

  async function patch(body: Record<string, unknown>, message: string) {
    try {
      await fetchJson(`/api/prompts/${doc.id}`, { method: "PATCH", body: JSON.stringify(body) });
      toast.success(message);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-4 py-6 sm:px-8 sm:py-8">
      <div className="flex flex-wrap items-start gap-3">
        <Button asChild variant="ghost" size="icon-sm" aria-label="프롬프트 목록">
          <Link href="/prompts">
            <ArrowLeft />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          {editingTitle ? (
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                setEditingTitle(false);
                if (title.trim() && title !== doc.title) void patch({ title: title.trim() }, "제목을 바꿨어요.");
              }}
            >
              <Input autoFocus value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} className="h-10 max-w-lg text-[18px] font-semibold" />
              <Button type="submit" variant="primary" size="sm">
                <Check /> 저장
              </Button>
            </form>
          ) : (
            <h1 className="flex items-center gap-2 text-[24px] font-semibold tracking-[-0.02em]">
              {doc.title}
              {doc.canManage && (
                <button type="button" onClick={() => setEditingTitle(true)} className="rounded-md p-1 text-fg-4 hover:bg-panel-2 hover:text-fg-2" aria-label="제목 바꾸기">
                  <Pencil className="size-4" />
                </button>
              )}
            </h1>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px] text-fg-3">
            <span className="flex items-center gap-1.5">
              <Avatar name={doc.ownerName ?? "?"} size={18} /> {doc.ownerName}
            </span>
            <span>·</span>
            <span className="flex items-center gap-1">
              <VisIcon className="size-3.5" /> {VISIBILITY_LABEL[doc.visibility]}
            </span>
            <span>·</span>
            <span className="font-mono">v{doc.latestVersion}</span>
            {model && (
              <>
                <span>·</span>
                <span>{model.name}</span>
              </>
            )}
            {doc.tags.map((t) => (
              <span key={t} className="rounded-md border border-line-2 px-1.5 text-[11px]">
                #{t}
              </span>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {targets.map((k) => (
            <Button key={k} asChild variant={k === targets[0] ? "primary" : "secondary"} size="sm">
              <Link href={`/create/${k}?preset=${doc.id}`}>
                {k === "image" ? <ImagePlus /> : <Clapperboard />} {k === "image" ? "이미지 스튜디오에서 열기" : "영상 스튜디오에서 열기"}
              </Link>
            </Button>
          ))}
          <Button variant="secondary" size="sm" onClick={() => copyShareLink(doc.id)}>
            <Link2 /> 링크 복사
          </Button>
        </div>
      </div>

      {doc.canManage && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-panel/60 px-4 py-3 text-[12.5px]">
          <span className="text-fg-3">공개 범위</span>
          <Segmented
            size="xs"
            value={doc.visibility}
            onChange={(v) => void patch({ visibility: v }, `${VISIBILITY_LABEL[v]}로 바꿨어요.`)}
            options={[
              { value: "private", label: "나만" },
              { value: "team", label: "우리 팀" },
              { value: "company", label: "전사" },
            ]}
          />
          <span className="text-fg-4">{doc.visibility === "private" ? "링크를 받아도 나만 볼 수 있어요." : doc.visibility === "team" ? "같은 팀원이 보고 새 버전을 더할 수 있어요." : "회사 모든 사람이 볼 수 있어요."}</span>
          <Button
            variant="ghost"
            size="xs"
            className="ml-auto text-danger"
            onClick={async () => {
              if (!(await confirm({ title: "이 프롬프트를 삭제할까요?", description: "모든 버전 기록이 함께 삭제돼요.", confirmLabel: "삭제", danger: true }))) return;
              await fetchJson(`/api/prompts/${doc.id}`, { method: "DELETE" });
              toast.success("삭제했어요.");
              router.push("/prompts");
            }}
          >
            <Trash2 /> 삭제
          </Button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(320px,1fr)]">
        {/* 선택한 버전 */}
        <section className="flex min-w-0 flex-col gap-4">
          <div className="rounded-2xl border border-line bg-panel">
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
              <span className="rounded-md bg-accent px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[#0a0a0a]">v{current?.version}</span>
              <span className="text-[13px] font-medium">{current?.note || (current?.version === 1 ? "처음 저장" : "메모 없음")}</span>
              <span className="text-[11.5px] text-fg-4">
                {current?.authorName} · {current && <TimeAgo date={current.createdAt} />}
              </span>
              {prev && (
                <Segmented
                  size="xs"
                  className="ml-auto"
                  value={mode}
                  onChange={setMode}
                  options={[
                    { value: "diff", label: `v${prev.version} 대비 변경` },
                    { value: "text", label: "전체 내용" },
                  ]}
                />
              )}
              <Button
                variant="ghost"
                size="icon-xs"
                className={cn(!prev && "ml-auto")}
                aria-label="복사"
                onClick={async () => {
                  await navigator.clipboard.writeText(current?.prompt ?? "");
                  toast.success("프롬프트를 복사했어요.");
                }}
              >
                <Copy />
              </Button>
            </div>
            <div className="p-5">
              {prev && mode === "diff" ? (
                <DiffView from={prev.prompt} to={current?.prompt ?? ""} className="text-[15px]" />
              ) : (
                <p className="whitespace-pre-wrap text-[15.5px] leading-[1.8] text-fg">{current?.prompt}</p>
              )}
            </div>
          </div>
          <div className="rounded-2xl border border-line bg-panel/60 p-3">
            <BilingualPanel
              text={current?.prompt ?? ""}
              lang={tr.lang}
              segments={tr.data?.segments ?? []}
              loading={tr.loading}
              error={tr.error}
              mock={tr.data?.mock}
              readOnly
              onApply={() => {}}
              onFocusRange={() => {}}
              onRetry={() => void tr.refetch()}
            />
          </div>
        </section>

        {/* 버전 타임라인 */}
        <aside className="flex flex-col gap-2">
          <h2 className="px-1 text-[13px] font-semibold">버전 기록 · {versions.length}개</h2>
          <ol className="relative flex flex-col gap-1 before:absolute before:bottom-4 before:left-[23px] before:top-4 before:w-px before:bg-line-2">
            {versions.map((v, i) => {
              const older = versions[i + 1];
              return (
                <motion.li key={v.id} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 10) * 0.03 }}>
                  <button
                    type="button"
                    onClick={() => setSelected(v.version)}
                    className={cn(
                      "relative flex w-full items-start gap-3 rounded-xl px-2.5 py-2.5 text-left transition",
                      selected === v.version ? "bg-panel-2 ring-1 ring-line-3" : "hover:bg-panel-2/60",
                    )}
                  >
                    <span
                      className={cn(
                        "z-10 flex h-6 min-w-[40px] items-center justify-center rounded-full border font-mono text-[11px]",
                        selected === v.version ? "border-accent bg-accent text-[#0a0a0a]" : "border-line-2 bg-bg-2 text-fg-2",
                      )}
                    >
                      v{v.version}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-[13px] text-fg-2">{v.note || (v.version === 1 ? "처음 저장" : "메모 없음")}</span>
                        {older && <DiffBadge from={older.prompt} to={v.prompt} className="ml-auto shrink-0" />}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-fg-4">
                        {v.authorName} · <TimeAgo date={v.createdAt} />
                      </span>
                    </span>
                  </button>
                </motion.li>
              );
            })}
          </ol>
          {doc.canAddVersion && (
            <p className="px-1 pt-2 text-[12px] leading-relaxed text-fg-4">
              스튜디오에서 열어 고친 뒤 <kbd className="rounded border border-line-2 px-1 font-mono text-[10.5px]">⌘S</kbd>를 누르면 새 버전으로 쌓여요.
            </p>
          )}
        </aside>
      </div>
      {confirmDialog}
    </div>
  );
}
