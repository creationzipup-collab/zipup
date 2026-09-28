"use client";

import { CornerDownLeft, Search, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import * as React from "react";

import { cn } from "@/lib/utils";

import type { PortType } from "./canvas-context";
import { NODE_DEF, type NodeDef, type NodeKind, searchNodes, type Suggestion, suggestionsFor } from "./catalog";

export type QuickAddFrom = { nodeId: string; handleId: string; handleType: "source" | "target"; port: PortType };
export type QuickAddChoice = { type: NodeKind; data: Record<string, unknown>; handle?: string };

const TONE: Record<NodeDef["tone"], string> = {
  text: "bg-panel-3 text-fg-2",
  image: "bg-accent/15 text-accent",
  video: "bg-info/15 text-info",
  note: "bg-[#f5c542]/15 text-[#f5c542]",
};

type Item = { key: string; label: string; hint: string; icon: NodeDef["icon"]; tone: NodeDef["tone"]; choice: QuickAddChoice; suggested?: boolean };

/**
 * 노드 빠른 추가: 선을 빈 곳에 놓거나 빈 곳을 더블클릭하면 뜸.
 * 선에서 열면 이어 붙이기 좋은 노드를 먼저 추천하고, 고르면 자동으로 연결해요.
 */
export function QuickAdd({ at, from, onPick, onClose }: { at: { x: number; y: number }; from: QuickAddFrom | null; onPick: (c: QuickAddChoice) => void; onClose: () => void }) {
  const [q, setQ] = React.useState("");
  const [active, setActive] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const items: Item[] = React.useMemo(() => {
    const suggested: Item[] = from
      ? suggestionsFor(from)
          .filter((s) => !q.trim() || `${s.label} ${s.hint} ${NODE_DEF[s.type].keywords}`.toLowerCase().includes(q.trim().toLowerCase()))
          .map((s: Suggestion) => ({ key: s.key, label: s.label, hint: s.hint, icon: s.icon, tone: s.tone, choice: { type: s.type, data: s.data, handle: s.handle }, suggested: true }))
      : [];
    const rest: Item[] = searchNodes(q)
      .filter((d) => !from || !suggested.some((s) => s.choice.type === d.type))
      .map((d) => ({ key: d.type, label: d.label, hint: d.desc, icon: d.icon, tone: d.tone, choice: { type: d.type, data: d.make() } }));
    return [...suggested, ...rest];
  }, [from, q]);

  const safeActive = Math.min(active, Math.max(0, items.length - 1));
  const width = 300;
  const left = Math.min(Math.max(12, at.x + 8), (typeof window !== "undefined" ? window.innerWidth : 1200) - width - 12);
  const top = Math.min(Math.max(12, at.y - 20), (typeof window !== "undefined" ? window.innerHeight : 800) - 380);

  React.useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-i="${safeActive}"]`)?.scrollIntoView({ block: "nearest" });
  }, [safeActive]);

  return (
    <>
      <div className="fixed inset-0 z-[60]" onPointerDown={onClose} onContextMenu={(e) => e.preventDefault()} />
      <motion.div
        role="dialog"
        aria-label="노드 추가"
        initial={{ opacity: 0, scale: 0.96, y: -4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 520, damping: 34 }}
        style={{ left, top, width }}
        className="fixed z-[61] overflow-hidden rounded-2xl border border-line-2 bg-panel/95 shadow-[0_28px_70px_-24px_rgba(0,0,0,0.7)] backdrop-blur-xl"
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          else if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(items.length - 1, a + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            const it = items[safeActive];
            if (it) onPick(it.choice);
          }
        }}
      >
        <label className="flex items-center gap-2 border-b border-line px-3">
          <Search className="size-4 text-fg-4" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            placeholder={from ? "이어 붙일 노드 찾기" : "추가할 노드 찾기"}
            className="h-11 min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-fg-4"
          />
          <kbd className="rounded border border-line-2 px-1 font-mono text-[10px] text-fg-4">esc</kbd>
        </label>
        <div ref={listRef} className="max-h-[320px] overflow-y-auto p-1.5 scrollbar-thin">
          {items.map((it, i) => {
            const Icon = it.icon;
            const header = i === 0 && it.suggested ? "추천" : !it.suggested && (i === 0 || items[i - 1]?.suggested) ? (from ? "모든 노드" : null) : null;
            return (
              <React.Fragment key={it.key}>
                {header && (
                  <div className="flex items-center gap-1.5 px-2 pb-1 pt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-fg-4">
                    {header === "추천" && <Sparkles className="size-3 text-accent" />}
                    {header}
                  </div>
                )}
                <button
                  type="button"
                  data-i={i}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => onPick(it.choice)}
                  className={cn("flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition", i === safeActive ? "bg-panel-3" : "hover:bg-panel-2")}
                >
                  <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", TONE[it.tone])}>
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium">{it.label}</span>
                    <span className="block truncate text-[11.5px] text-fg-4">{it.hint}</span>
                  </span>
                  {i === safeActive && <CornerDownLeft className="size-3.5 text-fg-4" />}
                </button>
              </React.Fragment>
            );
          })}
          {!items.length && <p className="px-3 py-6 text-center text-[12.5px] text-fg-4">맞는 노드가 없어요</p>}
        </div>
      </motion.div>
    </>
  );
}
