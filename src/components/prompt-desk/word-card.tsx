"use client";

import { ArrowUpRight, BookOpen, CornerDownLeft, Languages, Replace, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import * as React from "react";
import { createPortal } from "react-dom";

import { Spinner } from "@/components/ui/button";
import { useDebounced } from "@/lib/client/use-debounced";
import { type LexLang, naverDictUrl, requestWordCandidates, useWordLookup } from "@/lib/client/lexicon";
import { cn } from "@/lib/utils";

export type WordTarget = {
  /** 원문 위치 */
  start: number;
  end: number;
  q: string;
  lang: LexLang;
  /** 화면 위치 (단어 영역) */
  rect: { left: number; top: number; bottom: number; width: number };
  mode: "info" | "replace";
};

const SOURCE_LABEL: Record<string, string> = {
  glossary: "용어집",
  dictionary: "사전",
  mt: "번역",
  llm: "AI",
  mock: "모의",
  none: "",
};

/**
 * 단어 카드 (파파고처럼 단어 위에 뜨는 사전).
 * - 뜻·설명·비슷한 표현 → "한국어로 바꾸기"로 원하는 뜻을 적으면 영어 후보를 추천
 */
export function WordCard({
  target,
  onClose,
  onReplace,
  onHoverChange,
  onReplaceMode,
}: {
  target: WordTarget | null;
  onClose: () => void;
  /** 없으면 읽기 전용(바꾸기 숨김) */
  onReplace?: (start: number, end: number, text: string) => void;
  onHoverChange?: (inside: boolean) => void;
  /** 카드 안에서 바꾸기로 전환했을 때 */
  onReplaceMode?: () => void;
}) {
  // 서버 렌더링 중에는 포털을 만들지 않음 (effect 없이 클라이언트 여부 확인)
  const isClient = React.useSyncExternalStore(noopSubscribe, clientSnapshot, serverSnapshot);
  if (!isClient) return null;
  return createPortal(
    <AnimatePresence>
      {target && (
        <CardBody key={`${target.start}-${target.end}-${target.q}-${target.mode}`} target={target} onClose={onClose} onReplace={onReplace} onHoverChange={onHoverChange} onReplaceMode={onReplaceMode} />
      )}
    </AnimatePresence>,
    document.body,
  );
}

const noopSubscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

function useCardPosition(rect: WordTarget["rect"], height: number) {
  const width = 300;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const left = Math.min(Math.max(12, rect.left + rect.width / 2 - width / 2), vw - width - 12);
  const below = rect.bottom + 10;
  const fitsBelow = below + height < vh - 12;
  const top = fitsBelow ? below : Math.max(12, rect.top - height - 10);
  return { left, top, width, placement: fitsBelow ? "below" : "above" } as const;
}

function CardBody({
  target,
  onClose,
  onReplace,
  onHoverChange,
  onReplaceMode,
}: {
  target: WordTarget;
  onClose: () => void;
  onReplace?: WordCardProps["onReplace"];
  onHoverChange?: (inside: boolean) => void;
  onReplaceMode?: () => void;
}) {
  const [mode, setMode] = React.useState<"info" | "replace">(onReplace ? target.mode : "info");
  const ref = React.useRef<HTMLDivElement>(null);
  const [height, setHeight] = React.useState(160);
  React.useLayoutEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(() => setHeight(ref.current?.offsetHeight ?? 160));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  const pos = useCardPosition(target.rect, height);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <motion.div
      ref={ref}
      role="dialog"
      aria-label={`${target.q} 뜻`}
      initial={{ opacity: 0, y: pos.placement === "below" ? -6 : 6, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.12 } }}
      transition={{ type: "spring", stiffness: 520, damping: 34 }}
      style={{ left: pos.left, top: pos.top, width: pos.width, transformOrigin: pos.placement === "below" ? "top center" : "bottom center" }}
      onMouseEnter={() => onHoverChange?.(true)}
      onMouseLeave={() => onHoverChange?.(false)}
      onMouseDown={(e) => e.stopPropagation()}
      className="fixed z-[80] overflow-hidden rounded-2xl border border-line-2 bg-panel/95 text-fg shadow-[0_24px_60px_-20px_rgba(0,0,0,0.55)] backdrop-blur-xl"
    >
      <div className="flex items-center gap-2 border-b border-line px-3.5 py-2.5">
        <span className="min-w-0 truncate font-display text-[15px] font-semibold tracking-[-0.01em]">{target.q}</span>
        <button type="button" onClick={onClose} className="ml-auto rounded-md p-1 text-fg-4 transition hover:bg-panel-2 hover:text-fg-2" aria-label="닫기">
          <X className="size-3.5" />
        </button>
      </div>
      {mode === "info" ? (
        <InfoView
          target={target}
          onReplace={
            onReplace
              ? () => {
                  onReplaceMode?.();
                  setMode("replace");
                }
              : undefined
          }
        />
      ) : (
        <ReplaceView target={target} onBack={() => setMode("info")} onApply={(text) => onReplace?.(target.start, target.end, text)} />
      )}
    </motion.div>
  );
}

type WordCardProps = React.ComponentProps<typeof WordCard>;

function InfoView({ target, onReplace }: { target: WordTarget; onReplace?: () => void }) {
  const { data, loading, error } = useWordLookup(target.q, target.lang);
  return (
    <div className="flex flex-col">
      <div className="flex min-h-[64px] flex-col gap-1.5 px-3.5 py-3">
        {loading && !data ? (
          <span className="flex items-center gap-2 text-[12.5px] text-fg-4">
            <Spinner className="size-3.5" /> 뜻 찾는 중
          </span>
        ) : error ? (
          <span className="text-[12.5px] text-danger">{error.message}</span>
        ) : data && data.senses.length ? (
          <>
            {data.senses.map((s, i) => (
              <p key={i} className="text-[14px] leading-snug">
                {s.pos && <span className="mr-1.5 rounded bg-panel-3 px-1 py-px align-[1px] text-[10.5px] text-fg-3">{s.pos}</span>}
                <span className={cn(i === 0 ? "font-medium text-fg" : "text-fg-2")}>{s.ko.join(", ")}</span>
              </p>
            ))}
            {data.en && data.en.length > 0 && <p className="text-[12px] text-fg-3">영어: {data.en.join(", ")}</p>}
            {data.note && <p className="text-[12px] leading-relaxed text-fg-3">{data.note}</p>}
            {data.alternatives.length > 0 && (
              <p className="flex flex-wrap items-center gap-1 pt-0.5 text-[11.5px] text-fg-4">
                비슷한 말
                {data.alternatives.map((a) => (
                  <span key={a} className="rounded-md border border-line-2 px-1.5 py-px text-fg-3">
                    {a}
                  </span>
                ))}
              </p>
            )}
          </>
        ) : (
          <span className="text-[12.5px] leading-relaxed text-fg-4">{data?.hint ?? "사전에 없는 표현이에요. 네이버 사전에서 찾아보세요."}</span>
        )}
      </div>
      <div className="flex items-center gap-1 border-t border-line bg-bg-2/60 px-2 py-1.5">
        {onReplace && (
          <button
            type="button"
            onClick={onReplace}
            className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-medium text-fg-2 transition hover:bg-panel-2 hover:text-fg"
          >
            <Replace className="size-3.5 text-accent" /> 한국어로 바꾸기
          </button>
        )}
        <a
          href={naverDictUrl(target.q, target.lang)}
          target="_blank"
          rel="noreferrer"
          className="ml-auto flex h-8 items-center gap-1 rounded-lg px-2.5 text-[12px] text-fg-3 transition hover:bg-panel-2 hover:text-fg"
        >
          <BookOpen className="size-3.5" /> 네이버 사전 <ArrowUpRight className="size-3" />
        </a>
        {data?.engine && data.source !== "none" && <span className="px-1.5 font-mono text-[10px] uppercase tracking-wider text-fg-4">{SOURCE_LABEL[data.source] || data.engine}</span>}
      </div>
    </div>
  );
}

function ReplaceView({ target, onBack, onApply }: { target: WordTarget; onBack: () => void; onApply: (text: string) => void }) {
  const [ko, setKo] = React.useState("");
  const debounced = useDebounced(ko.trim(), 450);
  // Enter를 누르면 기다리지 않고 바로 찾기
  const [forced, setForced] = React.useState<string | null>(null);
  const q = forced === ko.trim() ? forced : debounced;
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const query = useQuery({
    queryKey: ["word-candidates", target.lang, target.q.toLowerCase(), q],
    queryFn: () => requestWordCandidates({ ko: q, original: target.q, target: target.lang }),
    enabled: !!q,
    staleTime: Infinity,
    gcTime: 10 * 60_000,
    retry: false,
    placeholderData: (prev) => prev,
  });
  const items = q ? (query.data?.items ?? null) : null;
  const engine = query.data?.engine ?? "";
  const loading = query.isFetching;
  const error = query.error ? (query.error as Error).message : null;

  return (
    <div
      className="flex flex-col gap-2 px-3 py-3"
      onKeyDown={(e) => {
        if (items && /^[1-8]$/.test(e.key) && (e.metaKey || e.altKey || !ko)) {
          const c = items[Number(e.key) - 1];
          if (c) {
            e.preventDefault();
            onApply(c.text);
          }
        }
      }}
    >
      <label className="flex items-center gap-2 rounded-xl border border-line-2 bg-bg-2 px-3 transition focus-within:border-accent/60">
        <Languages className="size-4 shrink-0 text-fg-4" />
        <input
          ref={inputRef}
          value={ko}
          onChange={(e) => setKo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (items?.[0] && q === ko.trim() && !loading) onApply(items[0].text);
              else setForced(ko.trim());
            }
          }}
          placeholder="원하는 뜻을 한국어로 (예: 진홍색)"
          className="h-10 min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-fg-4"
        />
        {loading ? <Spinner className="size-3.5" /> : <CornerDownLeft className="size-3.5 text-fg-4" />}
      </label>

      {error && <p className="px-1 text-[12px] text-danger">{error}</p>}

      {items && items.length > 0 && (
        <ol className={cn("flex flex-col gap-1 transition-opacity", loading && "opacity-60")}>
          {items.map((c, i) => (
            <motion.li key={`${c.text}-${i}`} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}>
              <button
                type="button"
                onClick={() => onApply(c.text)}
                className="group grid w-full grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-panel-2"
              >
                <span className="flex size-[18px] items-center justify-center rounded bg-panel-3 font-mono text-[10px] text-fg-3 group-hover:bg-accent group-hover:text-[#0a0a0a]">{i + 1}</span>
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px] font-medium">{c.text}</span>
                  <span className="block truncate text-[11.5px] text-fg-4">
                    {c.ko}
                    {c.note ? ` · ${c.note}` : ""}
                  </span>
                </span>
                <span className="font-mono text-[9.5px] uppercase tracking-wider text-fg-4">{SOURCE_LABEL[c.source]}</span>
              </button>
            </motion.li>
          ))}
        </ol>
      )}
      {items && !items.length && !loading && <p className="px-1 text-[12px] text-fg-4">추천할 표현을 찾지 못했어요. 다른 말로 적어 보세요.</p>}

      <div className="flex items-center justify-between px-1 pt-0.5 text-[11px] text-fg-4">
        <button type="button" onClick={onBack} className="hover:text-fg-2">
          ← 뜻 보기
        </button>
        <span>{items ? `${engine} · 누르면 바로 적용` : "적으면 바로 추천해요"}</span>
      </div>
    </div>
  );
}

/** 읽기 전용 텍스트에서 단어에 마우스를 올리면 뜻 카드 (예: 한국어 대조의 원문 칸) */
export function useHoverCard(delay = 380) {
  const [target, setTarget] = React.useState<WordTarget | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const insideCard = React.useRef(false);
  const current = React.useRef<string | null>(null);
  // 바꾸기 카드가 열려 있으면 마우스를 올려도 덮어쓰지 않음
  const replacing = React.useRef(false);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const cancelHide = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = null;
  };

  const show = React.useCallback(
    (next: WordTarget, immediate = false) => {
      const id = `${next.start}:${next.end}:${next.mode}`;
      cancelHide();
      if (!immediate && (replacing.current || current.current === id)) return;
      clear();
      current.current = id;
      replacing.current = next.mode === "replace";
      if (immediate) setTarget(next);
      else timer.current = setTimeout(() => setTarget(next), delay);
    },
    [delay],
  );

  const scheduleHide = React.useCallback(() => {
    if (replacing.current) return;
    clear();
    current.current = null;
    cancelHide();
    hideTimer.current = setTimeout(() => {
      if (!insideCard.current) setTarget((t) => (t?.mode === "replace" ? t : null));
    }, 220);
  }, []);

  const close = React.useCallback(() => {
    clear();
    cancelHide();
    current.current = null;
    replacing.current = false;
    insideCard.current = false;
    setTarget(null);
  }, []);

  React.useEffect(() => () => {
    clear();
    cancelHide();
  }, []);

  const onHoverChange = React.useCallback(
    (inside: boolean) => {
      insideCard.current = inside;
      if (inside) cancelHide();
      else scheduleHide();
    },
    [scheduleHide],
  );

  const markReplacing = React.useCallback(() => {
    replacing.current = true;
  }, []);

  return { target, show, scheduleHide, close, onHoverChange, markReplacing };
}
