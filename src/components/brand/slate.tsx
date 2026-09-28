"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

const pad = (n: number) => String(n).padStart(2, "0");

/** 오늘 씬 번호 MMDD (한국 시간) — 서버·클라이언트 시각 차이는 hydration 경고 없이 넘겨요 */
function today() {
  const k = new Date(Date.now() + 9 * 3600_000);
  return { scene: `${pad(k.getUTCMonth() + 1)}${pad(k.getUTCDate())}` };
}

/**
 * 촬영 슬레이트(클래퍼보드). 나타날 때 한 번 "딱" 닫히고, 마우스를 올리면 다시 쳐요.
 * 빈 화면에서 "이제 첫 테이크"라는 느낌을 줘요.
 */
export function Slate({ director, take = 1, roll = "A001", className }: { director?: string | null; take?: number; roll?: string; className?: string }) {
  const [key, setKey] = React.useState(0);
  const { scene } = today();
  const cells: { label: string; value: string; wide?: boolean }[] = [
    { label: "Prod.", value: "ZIPUP AI", wide: true },
    { label: "Roll", value: roll },
    { label: "Scene", value: scene },
    { label: "Take", value: pad(take) },
    { label: "Cam", value: "A" },
    { label: "Director", value: director || "—", wide: true },
  ];
  return (
    <div
      aria-hidden
      className={cn("slate w-[272px] select-none", className)}
      onPointerEnter={() => setKey((k) => k + 1)}
    >
      {/* 윗막대 (치는 부분) */}
      <div key={key} className="slate-clapper relative h-[30px] rounded-t-[6px] border border-b-0 border-line-3 bg-[repeating-linear-gradient(-55deg,var(--fg)_0_14px,var(--bg)_14px_28px)]" />
      {/* 고정 막대 */}
      <div className="h-[18px] border border-line-3 bg-[repeating-linear-gradient(55deg,var(--fg)_0_14px,var(--bg)_14px_28px)]" />
      {/* 판 */}
      <div className="grid grid-cols-4 gap-px overflow-hidden rounded-b-[8px] border border-t-0 border-line-3 bg-line-2">
        {cells.map((c) => (
          <div key={c.label} className={cn("flex flex-col gap-1 bg-panel px-2.5 py-2 text-left", c.wide && "col-span-2")}>
            <span className="font-mono text-[8.5px] uppercase tracking-[0.18em] text-fg-4">{c.label}</span>
            <span className="truncate font-serif text-[17px] italic leading-none text-fg" suppressHydrationWarning>
              {c.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
