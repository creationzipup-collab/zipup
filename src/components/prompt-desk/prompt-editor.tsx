"use client";

import * as React from "react";

import { useHoverCard, WordCard, type WordTarget } from "@/components/prompt-desk/word-card";
import { Kbd } from "@/components/ui/misc";
import { lexLangOf, matchCase, phraseAt, wordTokens } from "@/lib/client/lexicon";
import { LANG_LABEL, type PromptLang } from "@/lib/prompt/lang";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  onChange: (v: string) => void;
  /** 내용 대부분을 붙여넣어 바꿨을 때 (이전 내용, 새 내용) */
  onPasteReplace?: (before: string, after: string) => void;
  /** 단어 카드에서 고른 표현으로 바꾸기 (없으면 뜻 보기만) */
  onReplace?: (start: number, end: number, text: string) => void;
  lang: PromptLang;
  kind: "image" | "video";
  header?: React.ReactNode;
  footer?: React.ReactNode;
  size?: "md" | "lg";
  maxLength?: number;
  /** 한국어 대조에서 고른 구간을 편집기에서 강조 */
  highlight?: { start: number; end: number } | null;
};

const PLACEHOLDER = {
  image:
    "만들고 싶은 장면을 자세히 적어 주세요. 영어·중국어로 쓰면 '한국어 대조'에 구간별 직역이 나오고,\n단어에 마우스를 올리면 뜻이, 더블클릭하면 한국어로 바꾸기가 떠요.\n\n예) a woman in a red silk dress walking through a neon-lit Seoul alley at night, rain, cinematic 35mm",
  video:
    "장면, 움직임, 카메라 무빙, 소리를 적어 주세요. 단어에 마우스를 올리면 뜻이 떠요.\n\n예) slow dolly-in on a dancer under red stage lights, smoke drifting, camera circles around her, crowd cheering",
};

/** 스튜디오의 주인공: 큰 프롬프트 편집기 (단어에 마우스를 올리면 뜻, 더블클릭하면 바꾸기) */
export const PromptEditor = React.forwardRef<HTMLTextAreaElement, Props>(function PromptEditor(
  { value, onChange, onPasteReplace, onReplace, lang, kind, header, footer, size = "lg", maxLength = 7000, highlight },
  ref,
) {
  const inner = React.useRef<HTMLTextAreaElement | null>(null);
  const backdrop = React.useRef<HTMLDivElement | null>(null);
  const mirror = React.useRef<HTMLDivElement | null>(null);
  const [gutter, setGutter] = React.useState(0);
  const textClass = cn("px-5 pb-3 pt-2 leading-[1.75] whitespace-pre-wrap break-words", size === "lg" ? "text-[16.5px]" : "text-[15px]");
  const hl = highlight && highlight.end > highlight.start && highlight.end <= value.length ? highlight : null;
  React.useImperativeHandle(ref, () => inner.current!);
  const pasting = React.useRef<{ before: string; big: boolean } | null>(null);
  const card = useHoverCard(420);
  const frame = React.useRef<number | null>(null);

  // 내용에 맞춰 높이 자동 조절 + 스크롤바 폭만큼 뒤쪽 레이어 여백 맞춤
  React.useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    el.style.height = "auto";
    const max = Math.round(window.innerHeight * (size === "lg" ? 0.55 : 0.4));
    el.style.height = `${Math.min(Math.max(el.scrollHeight, size === "lg" ? 200 : 140), max)}px`;
    setGutter(el.offsetWidth - el.clientWidth);
  }, [value, size]);

  const hoverable = lang !== "empty" && lang !== "ko";
  const tokens = React.useMemo(() => (hoverable ? wordTokens(value, lang) : []), [value, lang, hoverable]);

  // 단어 위치를 찾기 위한 보이지 않는 복제 레이어 (textarea와 같은 줄바꿈)
  const mirrorNodes = React.useMemo(() => {
    if (!tokens.length) return null;
    const nodes: React.ReactNode[] = [];
    let pos = 0;
    tokens.forEach((t, i) => {
      if (t.start > pos) nodes.push(value.slice(pos, t.start));
      nodes.push(
        <span key={i} data-wi={i} className="pointer-events-auto">
          {t.text}
        </span>,
      );
      pos = t.end;
    });
    nodes.push(`${value.slice(pos)}​`);
    return nodes;
  }, [tokens, value]);

  function tokenAt(x: number, y: number): number | null {
    const m = mirror.current;
    if (!m) return null;
    for (const el of document.elementsFromPoint(x, y)) {
      if (el instanceof HTMLElement && el.dataset.wi !== undefined && m.contains(el)) return Number(el.dataset.wi);
    }
    return null;
  }

  function rectOf(start: number, end: number) {
    const m = mirror.current;
    const a = tokens.findIndex((t) => t.end > start);
    const b = tokens.findLastIndex((t) => t.start < end);
    const first = m?.querySelector<HTMLElement>(`[data-wi="${a}"]`)?.getBoundingClientRect();
    const last = m?.querySelector<HTMLElement>(`[data-wi="${b}"]`)?.getBoundingClientRect();
    if (!first) return null;
    const sameLine = last && Math.abs(last.top - first.top) < 4;
    return { left: first.left, top: first.top, bottom: first.bottom, width: sameLine ? last.right - first.left : first.width };
  }

  function targetAt(i: number, mode: WordTarget["mode"]): WordTarget | null {
    const p = phraseAt(tokens, i, value);
    if (!p) return null;
    const rect = rectOf(p.start, p.end);
    return rect ? { ...p, rect, mode } : null;
  }

  function onSelectionLookup(el: HTMLTextAreaElement) {
    const { selectionStart: s, selectionEnd: e } = el;
    if (e - s < 2 || e - s > 60) return;
    const raw = value.slice(s, e);
    const q = raw.trim();
    if (!q || /\n/.test(q) || q.split(/\s+/).length > 5) return;
    const lang = lexLangOf(q);
    if (!lang) return;
    const start = s + raw.indexOf(q);
    const rect = rectOf(start, start + q.length);
    if (rect) card.show({ start, end: start + q.length, q, lang, rect, mode: "info" }, true);
  }

  const replace = onReplace
    ? (start: number, end: number, text: string) => {
        onReplace(start, end, matchCase(value.slice(start, end), text));
        card.close();
        inner.current?.focus();
      }
    : undefined;

  const layerStyle = gutter ? { paddingRight: `calc(1.25rem + ${gutter}px)` } : undefined;

  return (
    <div className="prompt-card group/editor relative rounded-[22px] p-px">
      <div className="relative flex flex-col rounded-[21px] bg-panel">
        <div className="flex min-h-11 flex-wrap items-center gap-2 px-4 pt-3">
          {header}
          {lang !== "empty" && (
            <span className="ml-auto rounded-md border border-line-2 px-1.5 py-0.5 font-mono text-[10.5px] tracking-wide text-fg-3">{LANG_LABEL[lang]}</span>
          )}
        </div>
        <div className="relative">
          {mirrorNodes && (
            <div ref={mirror} aria-hidden className={cn("pointer-events-none absolute inset-0 select-none overflow-hidden text-transparent", textClass)} style={layerStyle}>
              {mirrorNodes}
            </div>
          )}
          {hl && (
            <div ref={backdrop} aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden text-transparent", textClass)} style={layerStyle}>
              {value.slice(0, hl.start)}
              <mark className="animate-[hl-in_0.5s_ease-out] rounded-[5px] bg-accent/25 text-transparent shadow-[0_0_0_2px_color-mix(in_oklab,var(--accent)_25%,transparent)]">
                {value.slice(hl.start, hl.end)}
              </mark>
              {value.slice(hl.end)}
            </div>
          )}
          <textarea
            ref={inner}
            value={value}
            onScroll={(e) => {
              const top = e.currentTarget.scrollTop;
              if (backdrop.current) backdrop.current.scrollTop = top;
              if (mirror.current) mirror.current.scrollTop = top;
              if (card.target?.mode === "info") card.close();
            }}
            maxLength={maxLength}
            spellCheck={false}
            onChange={(e) => {
              const next = e.target.value;
              const p = pasting.current;
              pasting.current = null;
              onChange(next);
              if (card.target) card.close();
              // 새 버전을 통째로(또는 대부분) 붙여넣은 경우 → 이전 내용과 비교
              if (p?.big && onPasteReplace && p.before.trim() && next !== p.before) onPasteReplace(p.before, next);
            }}
            onPaste={(e) => {
              const el = e.currentTarget;
              const pasted = e.clipboardData.getData("text");
              const selectedAll = el.selectionStart === 0 && el.selectionEnd === el.value.length && el.value.length > 0;
              pasting.current = { before: el.value, big: selectedAll || pasted.length >= Math.max(40, el.value.length * 0.6) };
            }}
            onMouseMove={(e) => {
              if (!hoverable || e.buttons) return;
              const { clientX, clientY } = e;
              if (frame.current) cancelAnimationFrame(frame.current);
              frame.current = requestAnimationFrame(() => {
                const i = tokenAt(clientX, clientY);
                const t = i === null ? null : targetAt(i, "info");
                if (t) card.show(t);
                else if (card.target?.mode !== "replace") card.scheduleHide();
              });
            }}
            onMouseLeave={() => {
              if (frame.current) cancelAnimationFrame(frame.current);
              card.scheduleHide();
            }}
            onMouseUp={(e) => {
              // 더블클릭은 바꾸기 카드가 맡음
              if (hoverable && e.detail < 2) onSelectionLookup(e.currentTarget);
            }}
            onDoubleClick={(e) => {
              if (!hoverable || !onReplace) return;
              if (frame.current) cancelAnimationFrame(frame.current);
              const i = tokenAt(e.clientX, e.clientY);
              const t = i === null ? null : targetAt(i, "replace");
              if (t) card.show(t, true);
            }}
            onKeyDown={() => {
              if (card.target?.mode === "info") card.close();
            }}
            placeholder={PLACEHOLDER[kind]}
            className={cn("relative block w-full resize-none bg-transparent text-fg outline-none placeholder:text-fg-4 placeholder:leading-relaxed", textClass)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line px-4 py-2.5">
          {footer}
          <span className="ml-auto flex items-center gap-3 text-[11px] text-fg-4">
            {hoverable && <span className="hidden lg:inline">단어에 올리면 뜻 · 더블클릭하면 바꾸기</span>}
            <span className="font-mono tabular-nums">
              {value.length.toLocaleString()} / {maxLength.toLocaleString()}
            </span>
            <span className="hidden items-center gap-1 sm:flex">
              <Kbd>⌘</Kbd>
              <Kbd>S</Kbd> 저장
            </span>
            <span className="hidden items-center gap-1 sm:flex">
              <Kbd>⌘</Kbd>
              <Kbd>↵</Kbd> 생성
            </span>
          </span>
        </div>
      </div>
      <WordCard target={card.target} onClose={card.close} onReplace={replace} onHoverChange={card.onHoverChange} onReplaceMode={card.markReplacing} />
    </div>
  );
});

/** 읽기 전용 글(한국어 대조의 원문 칸 등)에서 단어 뜻 보기·바꾸기 */
export function HoverText({
  text,
  lang,
  offset = 0,
  onReplace,
  className,
}: {
  text: string;
  lang: PromptLang;
  /** 전체 프롬프트에서 이 글이 시작하는 위치 (바꾸기에 사용) */
  offset?: number;
  onReplace?: (start: number, end: number, text: string) => void;
  className?: string;
}) {
  const tokens = React.useMemo(() => (lang === "empty" || lang === "ko" ? [] : wordTokens(text, lang)), [text, lang]);
  const card = useHoverCard(380);
  if (!tokens.length) return <span className={className}>{text}</span>;

  const target = (i: number, el: HTMLElement, mode: WordTarget["mode"]): WordTarget | null => {
    const p = phraseAt(tokens, i, text);
    if (!p) return null;
    const r = el.getBoundingClientRect();
    return { start: offset + p.start, end: offset + p.end, q: p.q, lang: p.lang, rect: { left: r.left, top: r.top, bottom: r.bottom, width: r.width }, mode };
  };

  const nodes: React.ReactNode[] = [];
  let pos = 0;
  tokens.forEach((t, i) => {
    if (t.start > pos) nodes.push(text.slice(pos, t.start));
    nodes.push(
      <span
        key={i}
        onMouseEnter={(e) => {
          const next = target(i, e.currentTarget, "info");
          if (next) card.show(next);
        }}
        onMouseLeave={card.scheduleHide}
        onDoubleClick={(e) => {
          if (!onReplace) return;
          e.preventDefault();
          e.stopPropagation();
          const next = target(i, e.currentTarget, "replace");
          if (next) card.show(next, true);
        }}
        className="rounded-[3px] transition-colors hover:bg-accent/15 hover:text-fg"
      >
        {t.text}
      </span>,
    );
    pos = t.end;
  });
  nodes.push(text.slice(pos));

  return (
    <>
      <span className={className}>{nodes}</span>
      <WordCard
        target={card.target}
        onClose={card.close}
        onHoverChange={card.onHoverChange}
        onReplaceMode={card.markReplacing}
        onReplace={
          onReplace
            ? (start, end, next) => {
                onReplace(start, end, next);
                card.close();
              }
            : undefined
        }
      />
    </>
  );
}
