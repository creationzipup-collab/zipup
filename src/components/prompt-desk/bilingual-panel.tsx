"use client";

import { ArrowRight, Check, Languages, RefreshCw, Sparkles, Wand2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import * as React from "react";
import { toast } from "sonner";

import { Button, Spinner } from "@/components/ui/button";
import { requestSuggestions, type Segment, type Suggestion } from "@/lib/client/prompt-tools";
import { LANG_LABEL, type PromptLang } from "@/lib/prompt/lang";
import { cn } from "@/lib/utils";

type Props = {
  text: string;
  lang: PromptLang;
  segments: Segment[];
  loading: boolean;
  error: (Error & { status?: number }) | null;
  mock?: boolean;
  stale?: boolean;
  readOnly?: boolean;
  onApply: (index: number, s: Suggestion) => void;
  onFocusRange: (start: number, end: number) => void;
  onRetry: () => void;
  onConvert?: (target: "en" | "zh") => void;
  converting?: "en" | "zh" | null;
};

export function BilingualPanel(props: Props) {
  const { text, lang, segments, loading, error, mock, stale, readOnly } = props;
  const [open, setOpen] = React.useState<number | null>(null);

  // 문장이 바뀌면 열린 추천 창 닫기
  const [prevText, setPrevText] = React.useState(text);
  if (prevText !== text) {
    setPrevText(text);
    if (open !== null && !segments[open]) setOpen(null);
  }

  if (lang === "empty") {
    return <PanelHint icon={<Languages />} title="프롬프트를 쓰면 한국어 대조가 여기에 나와요" desc="영어·중국어 프롬프트는 구간별로 한국어 직역을 보여주고, 한국어를 고치면 영어 표현을 추천해요." />;
  }
  if (lang === "ko") {
    return (
      <PanelHint
        icon={<Languages />}
        title="한국어 프롬프트예요"
        desc="모델에 따라 영어나 중국어가 더 정확할 수 있어요. 변환한 뒤에는 한국어 대조로 뜻을 확인할 수 있어요."
        action={
          props.onConvert && (
            <div className="flex gap-2">
              <Button variant="primary" size="sm" loading={props.converting === "en"} onClick={() => props.onConvert?.("en")}>
                영어로 변환
              </Button>
              <Button variant="secondary" size="sm" loading={props.converting === "zh"} onClick={() => props.onConvert?.("zh")}>
                中文으로 변환
              </Button>
            </div>
          )
        }
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex items-center gap-2 px-1 pb-2 text-[11.5px] text-fg-4">
        <span className="font-medium text-fg-3">{LANG_LABEL[lang] || "원문"} → 한국어 직역</span>
        {mock && <span className="rounded bg-warning/12 px-1.5 py-0.5 text-[10.5px] text-warning">모의 번역 · LLM 미연결</span>}
        <span className="ml-auto flex items-center gap-1.5">
          {loading ? (
            <>
              <Spinner className="size-3" /> 번역 중
            </>
          ) : stale ? (
            "입력 멈추면 번역"
          ) : (
            !readOnly && "구간을 누르면 표현 추천"
          )}
        </span>
      </div>

      {error ? (
        <div className="flex flex-col items-start gap-2 rounded-xl border border-danger/25 bg-danger/[0.06] p-3 text-[12.5px] text-fg-2">
          <span>{error.message}</span>
          <Button variant="secondary" size="xs" onClick={props.onRetry}>
            <RefreshCw /> 다시 번역
          </Button>
        </div>
      ) : !segments.length && loading ? (
        <div className="flex flex-col gap-1.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-11 rounded-xl" style={{ opacity: 1 - i * 0.18 }} />
          ))}
        </div>
      ) : (
        <ol className={cn("flex flex-col gap-1 transition-opacity", (loading || stale) && "opacity-60")}>
          {segments.map((seg, i) => (
            <li key={`${seg.start}-${seg.src}`}>
              <button
                type="button"
                disabled={readOnly}
                onClick={() => {
                  setOpen((o) => (o === i ? null : i));
                  props.onFocusRange(seg.start, seg.end);
                }}
                className={cn(
                  "group relative grid w-full grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] items-start gap-3 rounded-xl px-3 py-2 text-left transition",
                  open === i ? "bg-panel-2 ring-1 ring-line-3" : "hover:bg-panel-2/70",
                  readOnly && "cursor-default hover:bg-transparent",
                )}
              >
                <span className={cn("absolute left-0 top-2 bottom-2 w-[2px] rounded-full transition", open === i ? "bg-accent" : "bg-transparent group-hover:bg-line-3")} />
                <span className="text-[12.5px] leading-relaxed text-fg-3">{seg.src}</span>
                <span className={cn("text-[13.5px] leading-relaxed", seg.dst ? "text-fg" : "italic text-fg-4")}>{seg.dst || "번역 없음"}</span>
              </button>
              <AnimatePresence initial={false}>
                {open === i && !readOnly && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
                    className="overflow-hidden"
                  >
                    <SuggestBox
                      prompt={text}
                      seg={seg}
                      onClose={() => setOpen(null)}
                      onApply={(s) => {
                        props.onApply(i, s);
                        setOpen(null);
                      }}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function SuggestBox({ prompt, seg, onApply, onClose }: { prompt: string; seg: Segment; onApply: (s: Suggestion) => void; onClose: () => void }) {
  const [ko, setKo] = React.useState(seg.dst);
  const [focus, setFocus] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [items, setItems] = React.useState<Suggestion[] | null>(null);
  const [mock, setMock] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const words = seg.dst.split(/\s+/).filter((w) => w.replace(/[\p{P}]/gu, "").length > 0);
  const edited = ko.trim() !== seg.dst.trim();

  React.useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  async function run() {
    setLoading(true);
    try {
      const r = await requestSuggestions({ prompt, src: seg.src, dst: seg.dst, editedKo: edited ? ko : null, focusKo: !edited ? focus : null, count: 4 });
      setItems(r.suggestions);
      setMock(r.mock);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="mx-1 mb-2 mt-1 flex flex-col gap-3 rounded-xl border border-line-2 bg-bg-2/80 p-3"
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
        if (items && /^[1-6]$/.test(e.key) && document.activeElement?.tagName !== "INPUT") {
          const s = items[Number(e.key) - 1];
          if (s) onApply(s);
        }
      }}
    >
      <div className="flex flex-col gap-1.5">
        <span className="text-[11.5px] text-fg-4">원하는 뜻으로 한국어를 고치거나, 바꿀 단어를 골라 주세요</span>
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            value={ko}
            onChange={(e) => setKo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void run();
              }
            }}
            className="h-9 min-w-0 flex-1 rounded-lg border border-line-2 bg-panel px-3 text-[13.5px] outline-none transition focus:border-fg-3"
          />
          <Button variant="primary" size="sm" loading={loading} onClick={run}>
            {!loading && <Wand2 />} 추천
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="닫기">
            <X />
          </Button>
        </div>
        {!edited && words.length > 1 && (
          <div className="flex flex-wrap gap-1">
            {words.map((w, i) => (
              <button
                key={`${w}-${i}`}
                type="button"
                onClick={() => setFocus((f) => (f === w ? null : w))}
                className={cn(
                  "h-6 rounded-md border px-1.5 text-[12px] transition",
                  focus === w ? "border-accent bg-accent-soft text-accent" : "border-line-2 text-fg-3 hover:border-line-3 hover:text-fg-2",
                )}
              >
                {w}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading && !items && (
        <div className="grid gap-1.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton h-12 rounded-lg" />
          ))}
        </div>
      )}

      {items && (
        <div className={cn("flex flex-col gap-1.5 transition-opacity", loading && "opacity-50")}>
          <div className="flex items-center gap-2 text-[11px] text-fg-4">
            <Sparkles className="size-3.5 text-accent" /> 누르면 영어 프롬프트에 바로 적용돼요 · 숫자키 1–{items.length}
            {mock && <span className="rounded bg-warning/12 px-1 text-warning">모의</span>}
          </div>
          {items.map((s, i) => (
            <motion.button
              key={`${s.text}-${i}`}
              type="button"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, duration: 0.2 }}
              onClick={() => onApply(s)}
              className="group grid grid-cols-[20px_minmax(0,1fr)_auto] items-start gap-2.5 rounded-lg border border-line bg-panel px-3 py-2 text-left transition hover:border-accent/50 hover:bg-panel-2"
            >
              <span className="mt-0.5 flex size-5 items-center justify-center rounded-md bg-panel-3 font-mono text-[10.5px] text-fg-3 group-hover:bg-accent group-hover:text-[#0a0a0a]">
                {i + 1}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="text-[13.5px] font-medium text-fg">{s.text}</span>
                <span className="text-[12px] text-fg-3">
                  {s.ko}
                  {s.note && <span className="ml-1.5 text-fg-4">· {s.note}</span>}
                </span>
              </span>
              <span className="mt-0.5 flex items-center gap-1 text-[11.5px] text-fg-4 opacity-0 transition group-hover:opacity-100">
                적용 <ArrowRight className="size-3.5" />
              </span>
            </motion.button>
          ))}
          <button type="button" onClick={run} className="self-start text-[11.5px] text-fg-4 underline-offset-4 hover:text-fg-2 hover:underline">
            다른 표현 더 보기
          </button>
        </div>
      )}
    </div>
  );
}

function PanelHint({ icon, title, desc, action }: { icon: React.ReactNode; title: string; desc: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2.5 rounded-xl border border-dashed border-line-2 p-4">
      <span className="flex size-8 items-center justify-center rounded-lg bg-panel-2 text-fg-3 [&_svg]:size-4">{icon}</span>
      <div>
        <p className="text-[13.5px] font-medium">{title}</p>
        <p className="mt-0.5 text-[12.5px] leading-relaxed text-fg-3">{desc}</p>
      </div>
      {action}
    </div>
  );
}

export function AppliedToast({ onUndo }: { onUndo: () => void }) {
  return (
    <span className="flex items-center gap-2">
      <Check className="size-4 text-success" /> 적용했어요
      <button type="button" onClick={onUndo} className="text-fg-3 underline underline-offset-4">
        되돌리기
      </button>
    </span>
  );
}
