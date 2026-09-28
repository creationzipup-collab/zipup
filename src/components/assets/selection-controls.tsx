"use client";

import { Ban, Check, Star } from "lucide-react";
import * as React from "react";

import { Tip } from "@/components/ui/menu";
import { COLOR_LABELS, type ColorLabel, type Flag } from "@/lib/types";
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

export function FlagButtons({ value, onChange }: { value: Flag | null; onChange: (v: Flag | null) => void }) {
  return (
    <div className="inline-flex gap-1">
      <Tip content="셀렉(픽)" shortcut="P">
        <button
          type="button"
          onClick={() => onChange(value === "pick" ? null : "pick")}
          className={cn(
            "flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-medium transition",
            value === "pick" ? "border-success/40 bg-success/15 text-success" : "border-line-2 text-fg-3 hover:text-fg",
          )}
        >
          <Check className="size-3.5" /> 픽
        </button>
      </Tip>
      <Tip content="탈락(리젝)" shortcut="X">
        <button
          type="button"
          onClick={() => onChange(value === "reject" ? null : "reject")}
          className={cn(
            "flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-medium transition",
            value === "reject" ? "border-danger/40 bg-danger/15 text-danger" : "border-line-2 text-fg-3 hover:text-fg",
          )}
        >
          <Ban className="size-3.5" /> 탈락
        </button>
      </Tip>
    </div>
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

/** 에셋 단축키 처리 (1~5 별점, 0 초기화, P/X/U 플래그, 6~9 색, F 즐겨찾기) */
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
  if (k === "u") return { flag: null };
  if (k === "6") return { colorLabel: "red" };
  if (k === "7") return { colorLabel: "yellow" };
  if (k === "8") return { colorLabel: "green" };
  if (k === "9") return { colorLabel: "blue" };
  if (k === "f") return { favorite: "toggle" };
  return null;
}
