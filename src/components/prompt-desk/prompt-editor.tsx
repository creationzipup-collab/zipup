"use client";

import * as React from "react";

import { Kbd } from "@/components/ui/misc";
import { LANG_LABEL, type PromptLang } from "@/lib/prompt/lang";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  onChange: (v: string) => void;
  /** 내용 대부분을 붙여넣어 바꿨을 때 (이전 내용, 새 내용) */
  onPasteReplace?: (before: string, after: string) => void;
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
    "만들고 싶은 장면을 자세히 적어 주세요. 영어·중국어로 쓰면 '한국어 대조'에 구간별 직역이 나오고,\n한국어로 쓰면 영어·중국어로 바꿀 수 있어요.\n\n예) a woman in a red silk dress walking through a neon-lit Seoul alley at night, rain, cinematic 35mm",
  video:
    "장면, 움직임, 카메라 무빙, 소리를 적어 주세요.\n\n예) slow dolly-in on a dancer under red stage lights, smoke drifting, camera circles around her, crowd cheering",
};

/** 스튜디오의 주인공: 큰 프롬프트 편집기 */
export const PromptEditor = React.forwardRef<HTMLTextAreaElement, Props>(function PromptEditor(
  { value, onChange, onPasteReplace, lang, kind, header, footer, size = "lg", maxLength = 7000, highlight },
  ref,
) {
  const inner = React.useRef<HTMLTextAreaElement | null>(null);
  const backdrop = React.useRef<HTMLDivElement | null>(null);
  const textClass = cn("px-5 pb-3 pt-2 leading-[1.75] whitespace-pre-wrap break-words", size === "lg" ? "text-[16.5px]" : "text-[15px]");
  const hl = highlight && highlight.end > highlight.start && highlight.end <= value.length ? highlight : null;
  React.useImperativeHandle(ref, () => inner.current!);
  const pasting = React.useRef<{ before: string; big: boolean } | null>(null);

  // 내용에 맞춰 높이 자동 조절
  React.useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    el.style.height = "auto";
    const max = Math.round(window.innerHeight * (size === "lg" ? 0.55 : 0.4));
    el.style.height = `${Math.min(Math.max(el.scrollHeight, size === "lg" ? 200 : 140), max)}px`;
  }, [value, size]);

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
          {hl && (
            <div ref={backdrop} aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden text-transparent", textClass)}>
              {value.slice(0, hl.start)}
              <mark className="rounded-[5px] bg-accent/25 text-transparent shadow-[0_0_0_2px_color-mix(in_oklab,var(--accent)_25%,transparent)]">{value.slice(hl.start, hl.end)}</mark>
              {value.slice(hl.end)}
            </div>
          )}
        <textarea
          ref={inner}
          value={value}
          onScroll={(e) => {
            if (backdrop.current) backdrop.current.scrollTop = e.currentTarget.scrollTop;
          }}
          maxLength={maxLength}
          spellCheck={false}
          onChange={(e) => {
            const next = e.target.value;
            const p = pasting.current;
            pasting.current = null;
            onChange(next);
            // 새 버전을 통째로(또는 대부분) 붙여넣은 경우 → 이전 내용과 비교
            if (p?.big && onPasteReplace && p.before.trim() && next !== p.before) onPasteReplace(p.before, next);
          }}
          onPaste={(e) => {
            const el = e.currentTarget;
            const pasted = e.clipboardData.getData("text");
            const selectedAll = el.selectionStart === 0 && el.selectionEnd === el.value.length && el.value.length > 0;
            pasting.current = { before: el.value, big: selectedAll || pasted.length >= Math.max(40, el.value.length * 0.6) };
          }}
          placeholder={PLACEHOLDER[kind]}
          className={cn("relative block w-full resize-none bg-transparent text-fg outline-none placeholder:text-fg-4 placeholder:leading-relaxed", textClass)}
        />
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line px-4 py-2.5">
          {footer}
          <span className="ml-auto flex items-center gap-3 text-[11px] text-fg-4">
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
    </div>
  );
});
