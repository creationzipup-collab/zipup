"use client";

import * as React from "react";

import { type DiffOp, diffStats, diffWords } from "@/lib/prompt/diff";
import { cn } from "@/lib/utils";

/** 두 버전의 달라진 부분을 색으로 표시 (추가 = 초록, 삭제 = 빨강 취소선) */
export function DiffView({ from, to, className, compact }: { from: string; to: string; className?: string; compact?: boolean }) {
  const ops = React.useMemo(() => diffWords(from, to), [from, to]);
  return <DiffOps ops={ops} className={className} compact={compact} />;
}

export function DiffOps({ ops, className, compact }: { ops: DiffOp[]; className?: string; compact?: boolean }) {
  return (
    <div className={cn("whitespace-pre-wrap break-words leading-[1.8]", compact ? "text-[12.5px]" : "text-[14px]", className)}>
      {ops.map((op, i) =>
        op.type === "equal" ? (
          <span key={i} className="text-fg-2">
            {op.text}
          </span>
        ) : op.type === "insert" ? (
          <ins key={i} className="rounded-[4px] bg-success/15 px-0.5 text-success no-underline decoration-success/60 [box-shadow:inset_0_-1.5px_0_currentColor]">
            {op.text}
          </ins>
        ) : (
          <del key={i} className="rounded-[4px] bg-danger/12 px-0.5 text-danger/90 decoration-danger/70">
            {op.text}
          </del>
        ),
      )}
    </div>
  );
}

export function DiffBadge({ from, to, className }: { from: string; to: string; className?: string }) {
  const { added, removed } = React.useMemo(() => diffStats(diffWords(from, to)), [from, to]);
  if (!added && !removed) return null;
  return (
    <span className={cn("inline-flex items-center gap-1 font-mono text-[11px] tabular-nums", className)}>
      {added > 0 && <span className="text-success">+{added}</span>}
      {removed > 0 && <span className="text-danger">−{removed}</span>}
    </span>
  );
}
