"use client";

import { ChevronDown } from "lucide-react";
import type { QueryClient } from "@tanstack/react-query";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { CUT_NAME_MAX, cutSeries, isCodeLike, nextCutCodes } from "@/lib/cuts";
import { cn, fetchJson } from "@/lib/utils";

/** 컷 이름: 영문·숫자 이름(C001)은 고정폭, 한글·띄어쓰기가 있는 이름은 보통 글꼴로 */
export function CutName({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cn("min-w-0 truncate", isCodeLike(name) ? "font-mono tracking-[0.02em]" : "font-medium", className)} title={name}>
      {name}
    </span>
  );
}

export function renameCut(id: string, name: string) {
  return fetchJson(`/api/cuts/${id}`, { method: "PATCH", body: JSON.stringify({ code: name }) });
}

/** 이름을 바꾼 뒤: 컷 이름이 보이는 곳(결과·라이브러리·파일 이름)을 새로 불러와요 */
export function refreshAfterRename(qc: QueryClient) {
  for (const key of [["cut-board"], ["cut-options"], ["generations"], ["assets"], ["asset"]]) void qc.invalidateQueries({ queryKey: key });
}

/**
 * 이름 고치는 칸: 열리면 전체 선택, Enter·밖을 누르면 저장, Esc는 취소.
 * 저장이 실패하면 칸을 그대로 두고 다시 고칠 수 있어요.
 */
export function NameInput({
  initial,
  onSubmit,
  onCancel,
  className,
  placeholder = "컷 이름",
}: {
  initial: string;
  onSubmit: (name: string) => Promise<boolean>;
  onCancel: () => void;
  className?: string;
  placeholder?: string;
}) {
  const [value, setValue] = React.useState(initial);
  const [busy, setBusy] = React.useState(false);
  const closed = React.useRef(false);
  const ref = React.useCallback((el: HTMLInputElement | null) => {
    if (!el) return;
    // 메뉴가 닫히며 초점을 되돌려 놓은 뒤에 잡아요
    requestAnimationFrame(() => {
      el.focus();
      el.select();
    });
  }, []);

  async function submit() {
    if (closed.current || busy) return;
    const name = value.trim();
    if (!name || name === initial) {
      closed.current = true;
      onCancel();
      return;
    }
    setBusy(true);
    const ok = await onSubmit(name);
    setBusy(false);
    if (ok) closed.current = true;
  }

  return (
    <input
      ref={ref}
      value={value}
      maxLength={CUT_NAME_MAX}
      disabled={busy}
      placeholder={placeholder}
      aria-label="컷 이름"
      onChange={(e) => setValue(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          e.preventDefault();
          void submit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          closed.current = true;
          onCancel();
        }
      }}
      onBlur={() => void submit()}
      className={cn(
        "min-w-0 rounded-lg border border-accent/50 bg-panel-2 px-2 outline-none ring-4 ring-accent/10 transition disabled:opacity-60",
        isCodeLike(value) ? "font-mono tracking-[0.02em]" : "font-medium",
        className,
      )}
    />
  );
}

/**
 * 새 컷: 이름부터 적어요. 추천 이름이 미리 들어가 있어서 그대로 쓰거나 바로 덮어써요.
 * compact가 아니면 설명과 "여러 개 한 번에"도 있어요.
 */
export function NewCutForm({
  existing,
  onCreate,
  compact,
}: {
  existing: string[];
  onCreate: (input: { code: string; title?: string; count?: number }) => Promise<boolean>;
  compact?: boolean;
}) {
  const suggestion = nextCutCodes(existing, 1)[0];
  const [name, setName] = React.useState(suggestion);
  const [title, setTitle] = React.useState("");
  const [many, setMany] = React.useState(false);
  const [count, setCount] = React.useState(5);
  const [busy, setBusy] = React.useState(false);
  const series = cutSeries(name.trim() || suggestion, count, existing);
  const nameRef = React.useCallback((el: HTMLInputElement | null) => {
    if (!el) return;
    requestAnimationFrame(() => {
      el.focus();
      el.select();
    });
  }, []);

  async function create(n: number) {
    if (!name.trim() || busy) return;
    setBusy(true);
    const ok = await onCreate({ code: name.trim(), title: n === 1 ? title.trim() || undefined : undefined, count: n });
    setBusy(false);
    if (ok) {
      setTitle("");
      setName(nextCutCodes([...existing, ...cutSeries(name.trim(), n, existing)], 1)[0]);
    }
  }

  const field = "h-9 w-full rounded-lg border border-line-2 bg-panel-2 px-2.5 text-[13px] outline-none transition focus:border-accent/60";
  return (
    <form
      className="flex flex-col gap-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        void create(many ? count : 1);
      }}
    >
      <label className="flex flex-col gap-1 text-[11.5px] text-fg-3">
        이름
        <input
          ref={nameRef}
          value={name}
          maxLength={CUT_NAME_MAX}
          onChange={(e) => setName(e.target.value)}
          placeholder="예: C006, SEQ 03, 오프닝 드론"
          className={cn(field, isCodeLike(name) && "font-mono")}
        />
      </label>
      {!compact && !many && (
        <label className="flex flex-col gap-1 text-[11.5px] text-fg-3">
          설명 <span className="sr-only">(선택)</span>
          <input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="선택 — 예: 해 질 녘 옥상 와이드" className={field} />
        </label>
      )}
      {!compact && many && (
        <div className="flex flex-col gap-1.5 rounded-lg border border-line bg-white/[0.02] p-2.5">
          <label className="flex items-center justify-between gap-2 text-[11.5px] text-fg-3">
            몇 개
            <input
              type="number"
              min={2}
              max={200}
              value={count}
              onChange={(e) => setCount(Math.max(2, Math.min(200, Number(e.target.value) || 2)))}
              className="h-8 w-20 rounded-lg border border-line-2 bg-panel-2 px-2 text-right font-mono text-[12.5px] outline-none focus:border-accent/60"
            />
          </label>
          <p className="truncate text-[11.5px] text-fg-3">
            <span className={cn(isCodeLike(series[0]) && "font-mono")}>{series[0]}</span>
            <span className="px-1.5 text-fg-4">…</span>
            <span className={cn(isCodeLike(series.at(-1)) && "font-mono")}>{series.at(-1)}</span>
          </p>
        </div>
      )}
      <Button type="submit" variant="primary" loading={busy} disabled={!name.trim()}>
        {many ? `${count}개 만들기` : "만들기"}
      </Button>
      {!compact && (
        <button
          type="button"
          onClick={() => setMany((v) => !v)}
          className="flex items-center justify-center gap-1 text-[11.5px] text-fg-4 transition hover:text-fg-2"
        >
          {many ? "하나만 만들기" : "여러 개 한 번에"}
          <ChevronDown className={cn("size-3 transition", many && "rotate-180")} />
        </button>
      )}
    </form>
  );
}
