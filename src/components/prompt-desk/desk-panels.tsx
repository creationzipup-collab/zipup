"use client";

import { AtSign, BookmarkPlus, ChevronDown, GitCompareArrows, History, Languages, MoreHorizontal, Save, Send } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import * as React from "react";

import { DiffBadge, DiffOps, DiffView } from "@/components/prompt-desk/diff-view";
import type { DeskDoc } from "@/components/prompt-desk/versions";
import { Button, Spinner } from "@/components/ui/button";
import { Segmented } from "@/components/ui/controls";
import { Menu, MenuContent, MenuItem, MenuTrigger, Tip } from "@/components/ui/menu";
import { useTranslation } from "@/lib/client/prompt-tools";
import { diffStats, diffWords } from "@/lib/prompt/diff";
import { diffSegments, type SegmentChange, splitClauses, type Unit } from "@/lib/prompt/segment-diff";
import { cn } from "@/lib/utils";

export type DeskTab = "ko" | "mentions" | "diff" | "versions";
export type Baseline = { key: string; label: string; text: string };

/**
 * 편집기 상단: 지금 작업 중인 컷과 버전. 버전은 이 컷 안에서만 올라가요.
 * 라이브러리 저장·보내기는 메뉴에서.
 */
export function DocChip({
  label,
  doc,
  text,
  onSave,
  onVersions,
  onSaveToLibrary,
  onSend,
}: {
  label: string;
  doc: DeskDoc | null;
  text: string;
  onSave: () => void;
  onVersions: () => void;
  onSaveToLibrary: () => void;
  onSend: () => void;
}) {
  const dirty = doc ? doc.baseText !== text : text.trim().length > 0;
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <button
        type="button"
        onClick={onVersions}
        className="flex min-w-0 items-center gap-2 rounded-full px-2 py-1 text-left transition hover:bg-white/[0.05]"
        title="이 컷의 버전 기록"
      >
        <History className="size-3.5 shrink-0 text-fg-3" />
        {/* 컷 코드(영문·숫자)만 모노 — 한글 이름은 자간이 벌어져 보여요 */}
        <span className={cn("truncate text-[12.5px] text-fg", /^[\x20-\x7E]+$/.test(label) && "font-mono tracking-[0.02em]")}>{label}</span>
        {doc ? (
          <span className="shrink-0 rounded-full border border-accent/40 bg-accent/10 px-1.5 py-px font-mono text-[10.5px] text-accent">v{doc.baseVersion ?? doc.version}</span>
        ) : (
          <span className="shrink-0 text-[11px] text-fg-4">버전 없음</span>
        )}
        {doc && dirty && <DiffBadge from={doc.baseText} to={text} />}
      </button>
      <Tip content={`버전은 ${label} 안에서만 쌓여요 (라이브러리에는 안 올라가요)`} shortcut="⌘S">
        <Button variant={dirty ? "secondary" : "ghost"} size="xs" onClick={onSave} disabled={!text.trim()} aria-label={`${label}에 버전 저장`} className={cn(dirty && "border-accent/40 text-fg")}>
          <Save /> {label}에 저장
        </Button>
      </Tip>
      <Menu>
        <MenuTrigger asChild>
          <Button variant="ghost" size="icon-xs" aria-label="더보기" disabled={!text.trim()}>
            <MoreHorizontal />
          </Button>
        </MenuTrigger>
        <MenuContent align="end" className="w-[220px]">
          <MenuItem onSelect={onSaveToLibrary}>
            <BookmarkPlus /> 라이브러리에 저장
          </MenuItem>
          <MenuItem onSelect={onSend}>
            <Send /> 동료·팀에게 보내기
          </MenuItem>
        </MenuContent>
      </Menu>
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
  mentions,
  children,
  className,
}: {
  tab: DeskTab;
  onTab: (t: DeskTab) => void;
  translating: boolean;
  diffCount: number;
  versionLabel: string | null;
  /** @언급 탭 (레퍼런스를 받는 모델이거나 언급이 있을 때) */
  mentions?: { count: number; issues: number } | null;
  children: React.ReactNode;
  className?: string;
}) {
  const items: { id: DeskTab; label: string; icon: React.ElementType; extra?: React.ReactNode }[] = [
    { id: "ko", label: "한국어 대조", icon: Languages, extra: translating ? <Spinner className="size-3" /> : null },
    ...(mentions
      ? [
          {
            id: "mentions" as const,
            label: "언급",
            icon: AtSign,
            extra: mentions.issues ? (
              <span className="rounded-full bg-warning/15 px-1.5 font-mono text-[10px] text-warning">{mentions.issues}</span>
            ) : mentions.count ? (
              <span className="font-mono text-[10.5px] text-fg-4">{mentions.count}</span>
            ) : null,
          },
        ]
      : []),
    { id: "diff", label: "변경 비교", icon: GitCompareArrows, extra: diffCount ? <span className="rounded-full bg-accent-soft px-1.5 font-mono text-[10px] text-accent">{diffCount}</span> : null },
    { id: "versions", label: "버전 기록", icon: History, extra: versionLabel ? <span className="font-mono text-[10.5px] text-fg-4">{versionLabel}</span> : null },
  ];
  return (
    <div className={cn("flex flex-col rounded-2xl border border-line bg-white/[0.015]", className)}>
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
              {active && <motion.span layoutId="desk-tab" className="absolute inset-x-1.5 -bottom-px h-px bg-accent shadow-[0_0_10px_var(--accent-glow)]" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
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

/**
 * 변경 비교 + 한국어 뜻: 기준(저장된 버전·붙여넣기 전·마지막 생성·고른 버전)과 지금 글을 구간마다 비교해서
 * 어디가 바뀌었는지, 원래 뜻이 무엇이었고 지금은 무슨 뜻인지 함께 보여줘요.
 */
export function DiffPanel({ baselines, active, onPick, current }: { baselines: Baseline[]; active: Baseline | null; onPick: (b: Baseline) => void; current: string }) {
  const stats = React.useMemo(() => (active ? diffStats(diffWords(active.text, current)) : null), [active, current]);
  const trBefore = useTranslation(active?.text ?? "", !!active);
  const trAfter = useTranslation(current, !!active);
  const [showSame, setShowSame] = React.useState(false);
  const [showFull, setShowFull] = React.useState(false);
  const units = React.useCallback(
    (text: string, tr: ReturnType<typeof useTranslation>): Unit[] =>
      tr.data && !tr.stale && tr.data.segments.length ? tr.data.segments.map((s) => ({ text: s.src, ko: s.dst })) : splitClauses(text),
    [],
  );
  const changes = React.useMemo(() => (active ? diffSegments(units(active.text, trBefore), units(current, trAfter)) : []), [active, current, trBefore, trAfter, units]);
  const translating = trBefore.loading || trAfter.loading;
  const changed = changes.filter((c) => c.type !== "same");
  const same = changes.filter((c) => c.type === "same");

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
        <p className="rounded-xl bg-white/[0.03] px-3 py-4 text-center text-[12.5px] text-fg-3">{active.label}와(과) 똑같아요.</p>
      ) : (
        <>
          <div className="flex items-center gap-2 text-[11.5px] text-fg-4">
            <span>
              바뀐 구간 <b className="font-medium text-fg-2">{changed.length}</b>
            </span>
            {translating && (
              <span className="flex items-center gap-1.5">
                <Spinner className="size-3" /> 한국어 뜻 불러오는 중
              </span>
            )}
            <span className="ml-auto">원래 뜻 → 바뀐 뜻</span>
          </div>
          <ol className="flex max-h-[52vh] flex-col gap-2 overflow-y-auto pr-1 scrollbar-thin">
            {changed.map((c, i) => (
              <ChangeRow key={i} change={c} />
            ))}
            {showSame &&
              same.map((c, i) =>
                c.type === "same" ? (
                  <li key={`s${i}`} className="grid grid-cols-[46px_minmax(0,1fr)] gap-3 rounded-xl px-3 py-2 text-[12.5px] text-fg-4">
                    <span className="pt-0.5 font-mono text-[10.5px] tracking-[0.08em]">SAME</span>
                    <span className="min-w-0">
                      <span className="block text-fg-3">{c.after.text}</span>
                      {c.after.ko && <span className="mt-0.5 block">{c.after.ko}</span>}
                    </span>
                  </li>
                ) : null,
              )}
          </ol>
          <div className="flex flex-wrap items-center gap-3 text-[11.5px]">
            {same.length > 0 && (
              <button type="button" onClick={() => setShowSame((v) => !v)} className="text-fg-3 transition hover:text-fg">
                {showSame ? "그대로인 구간 숨기기" : `그대로인 구간 ${same.length}개 보기`}
              </button>
            )}
            <button type="button" onClick={() => setShowFull((v) => !v)} className="text-fg-3 transition hover:text-fg">
              {showFull ? "전체 글 닫기" : "전체 글에서 보기"}
            </button>
          </div>
          {showFull && (
            <div className="max-h-[40vh] overflow-y-auto rounded-xl border border-line bg-white/[0.015] p-3.5 scrollbar-thin">
              <DiffView from={active.text} to={current} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** 바뀐 구간 하나: 글의 변화 + 원래 뜻 → 바뀐 뜻 (뜻도 달라진 말에 색) */
function ChangeRow({ change }: { change: SegmentChange }) {
  if (change.type === "same") return null;
  const tag = { changed: { label: "바뀜", cls: "border-accent/40 bg-accent/10 text-accent" }, added: { label: "추가", cls: "border-success/40 bg-success/10 text-success" }, removed: { label: "빠짐", cls: "border-danger/40 bg-danger/10 text-danger" } }[change.type];
  const beforeKo = change.type === "added" ? null : change.before.ko;
  const afterKo = change.type === "removed" ? null : change.after.ko;
  return (
    <li className="grid grid-cols-[46px_minmax(0,1fr)] gap-3 rounded-xl border border-line bg-white/[0.015] px-3 py-2.5">
      <span className={cn("mt-0.5 inline-flex h-5 items-center justify-center rounded-full border text-[10.5px] font-medium", tag.cls)}>{tag.label}</span>
      <div className="min-w-0">
        {change.type === "changed" ? (
          <DiffOps ops={change.ops} compact />
        ) : change.type === "added" ? (
          <p className="text-[12.5px] leading-[1.8] text-success">{change.after.text}</p>
        ) : (
          <p className="text-[12.5px] leading-[1.8] text-danger/90 line-through decoration-danger/60">{change.before.text}</p>
        )}
        {(beforeKo || afterKo) && (
          <div className="mt-2 grid gap-1 border-t border-line pt-2 text-[12.5px] leading-relaxed">
            {beforeKo && (
              <div className="grid grid-cols-[34px_minmax(0,1fr)] gap-2">
                <span className="text-fg-4">원래</span>
                <span className={cn("text-fg-3", change.type === "removed" && "line-through decoration-danger/50")}>{beforeKo}</span>
              </div>
            )}
            {afterKo && (
              <div className="grid grid-cols-[34px_minmax(0,1fr)] gap-2">
                <span className="text-fg-4">지금</span>
                {beforeKo ? <DiffOps ops={diffWords(beforeKo, afterKo)} compact className="!text-[12.5px] !leading-relaxed" /> : <span className="text-fg">{afterKo}</span>}
              </div>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

/** 접을 수 있는 생성 설정 카드 */
export function SettingsCard({ summary, children, defaultOpen = true }: { summary: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div className="rounded-2xl border border-line bg-white/[0.015]">
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
