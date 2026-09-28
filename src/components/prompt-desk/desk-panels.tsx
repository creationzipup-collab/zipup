"use client";

import { ChevronDown, FileText, GitCompareArrows, History, Languages, Link2, Save } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import * as React from "react";

import { DiffBadge, DiffView } from "@/components/prompt-desk/diff-view";
import { copyShareLink, type DeskDoc } from "@/components/prompt-desk/versions";
import { Button, Spinner } from "@/components/ui/button";
import { Segmented } from "@/components/ui/controls";
import { Tip } from "@/components/ui/menu";
import { diffStats, diffWords } from "@/lib/prompt/diff";
import { cn } from "@/lib/utils";

export type DeskTab = "ko" | "diff" | "versions";
export type Baseline = { key: string; label: string; text: string };

/** 편집기 상단: 지금 편집 중인 프롬프트 문서와 버전 */
export function DocChip({ doc, text, onSave, onVersions }: { doc: DeskDoc | null; text: string; onSave: () => void; onVersions: () => void }) {
  const dirty = doc ? doc.baseText !== text : text.trim().length > 0;
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <button
        type="button"
        onClick={onVersions}
        className="flex min-w-0 items-center gap-2 rounded-lg px-1.5 py-1 text-left transition hover:bg-panel-2"
        title="버전 기록 보기"
      >
        <FileText className="size-4 shrink-0 text-fg-3" />
        <span className="truncate text-[13px] font-medium">{doc ? doc.title : "새 프롬프트"}</span>
        {doc && <span className="shrink-0 rounded-md bg-panel-3 px-1.5 py-0.5 font-mono text-[10.5px] text-fg-2">v{doc.baseVersion ?? doc.version}</span>}
        {doc && dirty && <DiffBadge from={doc.baseText} to={text} />}
        {!doc && dirty && <span className="shrink-0 text-[11px] text-fg-4">저장 안 됨</span>}
      </button>
      <Tip content={doc ? `v${doc.version + 1}로 저장` : "프롬프트 저장"} shortcut="⌘S">
        <Button variant={dirty ? "secondary" : "ghost"} size="icon-xs" onClick={onSave} disabled={!text.trim()} aria-label="저장">
          <Save />
        </Button>
      </Tip>
      {doc && (
        <Tip content="공유 링크 복사">
          <Button variant="ghost" size="icon-xs" onClick={() => copyShareLink(doc.id)} aria-label="공유 링크 복사">
            <Link2 />
          </Button>
        </Tip>
      )}
    </div>
  );
}

/** 대조 · 비교 · 버전 탭 */
export function DeskTabs({
  tab,
  onTab,
  translating,
  diffCount,
  versionLabel,
  children,
  className,
}: {
  tab: DeskTab;
  onTab: (t: DeskTab) => void;
  translating: boolean;
  diffCount: number;
  versionLabel: string | null;
  children: React.ReactNode;
  className?: string;
}) {
  const items: { id: DeskTab; label: string; icon: React.ElementType; extra?: React.ReactNode }[] = [
    { id: "ko", label: "한국어 대조", icon: Languages, extra: translating ? <Spinner className="size-3" /> : null },
    { id: "diff", label: "변경 비교", icon: GitCompareArrows, extra: diffCount ? <span className="rounded-full bg-accent-soft px-1.5 font-mono text-[10px] text-accent">{diffCount}</span> : null },
    { id: "versions", label: "버전 기록", icon: History, extra: versionLabel ? <span className="font-mono text-[10.5px] text-fg-4">{versionLabel}</span> : null },
  ];
  return (
    <div className={cn("flex flex-col rounded-2xl border border-line bg-panel/70", className)}>
      <div role="tablist" className="flex items-center gap-1 overflow-x-auto border-b border-line px-2 scrollbar-none">
        {items.map((it) => {
          const Icon = it.icon;
          const active = tab === it.id;
          return (
            <button
              key={it.id}
              role="tab"
              aria-selected={active}
              type="button"
              onClick={() => onTab(it.id)}
              className={cn("relative flex h-10 shrink-0 items-center gap-1.5 px-2.5 text-[12.5px] transition", active ? "text-fg" : "text-fg-3 hover:text-fg-2")}
            >
              <Icon className="size-3.5" />
              {it.label}
              {it.extra}
              {active && <motion.span layoutId="desk-tab" className="absolute inset-x-1.5 -bottom-px h-[2px] rounded-full bg-accent" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
            </button>
          );
        })}
      </div>
      <div className="min-h-0 p-3">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={tab} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.16 }}>
            {children}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

/** 변경 비교: 기준(저장된 버전·붙여넣기 전·마지막 생성·고른 버전)과 지금 내용 */
export function DiffPanel({ baselines, active, onPick, current }: { baselines: Baseline[]; active: Baseline | null; onPick: (b: Baseline) => void; current: string }) {
  const stats = React.useMemo(() => (active ? diffStats(diffWords(active.text, current)) : null), [active, current]);
  if (!baselines.length || !active) {
    return (
      <div className="flex flex-col items-start gap-2 rounded-xl border border-dashed border-line-2 p-4">
        <span className="flex size-8 items-center justify-center rounded-lg bg-panel-2 text-fg-3">
          <GitCompareArrows className="size-4" />
        </span>
        <p className="text-[13.5px] font-medium">비교할 기준이 아직 없어요</p>
        <p className="text-[12.5px] leading-relaxed text-fg-3">새 버전을 붙여넣거나, 저장하거나, 생성하면 이전 내용과 달라진 부분을 색으로 보여줘요.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {baselines.length > 1 ? (
          <Segmented size="xs" value={active.key} onChange={(k) => onPick(baselines.find((b) => b.key === k)!)} options={baselines.map((b) => ({ value: b.key, label: b.label }))} />
        ) : (
          <span className="text-[12px] text-fg-3">기준: {active.label}</span>
        )}
        {stats && (
          <span className="ml-auto flex items-center gap-2 font-mono text-[11.5px]">
            <span className="text-success">+{stats.added} 단어</span>
            <span className="text-danger">−{stats.removed} 단어</span>
          </span>
        )}
      </div>
      {active.text === current ? (
        <p className="rounded-xl bg-panel-2/60 px-3 py-4 text-center text-[12.5px] text-fg-3">{active.label}와(과) 똑같아요.</p>
      ) : (
        <div className="max-h-[46vh] overflow-y-auto rounded-xl border border-line bg-bg-2/60 p-3.5 scrollbar-thin">
          <DiffView from={active.text} to={current} />
        </div>
      )}
      <p className="flex flex-wrap items-center gap-3 text-[11px] text-fg-4">
        <span className="flex items-center gap-1">
          <ins className="rounded bg-success/15 px-1 text-success no-underline">추가</ins> 새로 들어간 단어
        </span>
        <span className="flex items-center gap-1">
          <del className="rounded bg-danger/12 px-1 text-danger">삭제</del> 빠진 단어
        </span>
      </p>
    </div>
  );
}

/** 접을 수 있는 생성 설정 카드 */
export function SettingsCard({ summary, children, defaultOpen = true }: { summary: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div className="rounded-2xl border border-line bg-panel/60">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 px-4 py-3 text-left" aria-expanded={open}>
        <span className="text-[13px] font-semibold">생성 설정</span>
        <span className="min-w-0 flex-1 truncate text-[12px] text-fg-4">{summary}</span>
        <ChevronDown className={cn("size-4 text-fg-3 transition-transform", open && "rotate-180")} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.2, 0.8, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-5 border-t border-line px-4 pb-4 pt-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
