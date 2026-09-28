"use client";

import { Star } from "lucide-react";
import * as React from "react";

import { Tip } from "@/components/ui/menu";
import { COLOR_LABELS, FLAG_LABEL, type ColorLabel, type Flag } from "@/lib/types";
import { cn } from "@/lib/utils";

export function StarRating({
  value,
  onChange,
  size = 16,
  className,
  readOnly,
}: {
  value: number;
  onChange?: (v: number) => void;
  size?: number;
  className?: string;
  readOnly?: boolean;
}) {
  const [hover, setHover] = React.useState<number | null>(null);
  const shown = hover ?? value;
  return (
    <div className={cn("inline-flex items-center", className)} onMouseLeave={() => setHover(null)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={readOnly}
          onMouseEnter={() => !readOnly && setHover(n)}
          onClick={(e) => {
            e.stopPropagation();
            onChange?.(value === n ? 0 : n);
          }}
          className="p-[2px] transition-transform hover:scale-110 disabled:cursor-default disabled:hover:scale-100"
          aria-label={`별점 ${n}`}
        >
          <Star
            style={{ width: size, height: size }}
            className={cn("transition-colors", n <= shown ? "fill-star text-star" : "text-fg-4")}
            strokeWidth={1.6}
          />
        </button>
      ))}
    </div>
  );
}

/** 판정 색: OK 초록 · NG 빨강 · KEEP 노랑 */
export const VERDICT_STYLE: Record<Flag, { on: string; solid: string }> = {
  pick: { on: "border-success/45 bg-success/15 text-success", solid: "bg-success text-black" },
  reject: { on: "border-danger/45 bg-danger/15 text-danger", solid: "bg-danger text-white" },
  keep: { on: "border-warning/45 bg-warning/15 text-warning", solid: "bg-warning text-black" },
};

const VERDICTS: { value: Flag; key: string; hint: string }[] = [
  { value: "pick", key: "P", hint: "쓸 테이크" },
  { value: "keep", key: "K", hint: "보류 — 나중에 다시 볼 것" },
  { value: "reject", key: "X", hint: "안 쓸 테이크" },
];

/** 클립 판정 버튼 OK · KEEP · NG */
export function FlagButtons({ value, onChange }: { value: Flag | null; onChange: (v: Flag | null) => void }) {
  return (
    <div className="inline-flex gap-1">
      {VERDICTS.map((v) => (
        <Tip key={v.value} content={v.hint} shortcut={v.key}>
          <button
            type="button"
            onClick={() => onChange(value === v.value ? null : v.value)}
            className={cn(
              "flex h-8 min-w-[46px] items-center justify-center rounded-lg border px-2.5 font-mono text-[11.5px] font-semibold tracking-[0.06em] transition",
              value === v.value ? VERDICT_STYLE[v.value].on : "border-line-2 text-fg-3 hover:border-line-3 hover:text-fg",
            )}
          >
            {FLAG_LABEL[v.value]}
          </button>
        </Tip>
      ))}
    </div>
  );
}

/** 작은 판정 표시 (썸네일 위) */
export function VerdictBadge({ flag, className }: { flag: Flag | null | undefined; className?: string }) {
  if (!flag) return null;
  return (
    <span className={cn("inline-flex h-[18px] items-center rounded-[5px] px-1.5 font-mono text-[9.5px] font-bold tracking-[0.08em] shadow", VERDICT_STYLE[flag].solid, className)}>
      {FLAG_LABEL[flag]}
    </span>
  );
}

export function ColorLabelPicker({ value, onChange }: { value: ColorLabel | null; onChange: (v: ColorLabel | null) => void }) {
  return (
    <div className="inline-flex items-center gap-1.5">
      {COLOR_LABELS.map((c) => (
        <Tip key={c.value} content={c.label} shortcut={c.key || undefined}>
          <button
            type="button"
            onClick={() => onChange(value === c.value ? null : c.value)}
            className={cn(
              "size-5 rounded-full transition-transform hover:scale-110",
              value === c.value && "ring-2 ring-fg ring-offset-2 ring-offset-bg",
            )}
            style={{ background: c.hex }}
            aria-label={c.label}
          />
        </Tip>
      ))}
    </div>
  );
}

export function colorHex(c: ColorLabel | null | undefined): string | undefined {
  return COLOR_LABELS.find((x) => x.value === c)?.hex;
}

/** 에셋 단축키 처리 (1~5 별점, 0 초기화, P=OK / X=NG / K=KEEP / U=판정 지우기, 6~9 색, F 즐겨찾기) */
export function selectionKeyAction(e: KeyboardEvent):
  | { rating: number }
  | { flag: Flag | null }
  | { colorLabel: ColorLabel | null }
  | { favorite: "toggle" }
  | null {
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  const k = e.key.toLowerCase();
  if (/^[0-5]$/.test(k)) return { rating: Number(k) };
  if (k === "p") return { flag: "pick" };
  if (k === "x") return { flag: "reject" };
  if (k === "k") return { flag: "keep" };
  if (k === "u") return { flag: null };
  if (k === "6") return { colorLabel: "red" };
  if (k === "7") return { colorLabel: "yellow" };
  if (k === "8") return { colorLabel: "green" };
  if (k === "9") return { colorLabel: "blue" };
  if (k === "f") return { favorite: "toggle" };
  return null;
}
