"use client";

import { Handle, Position } from "@xyflow/react";
import * as React from "react";

import { cn } from "@/lib/utils";

import { PORT_COLOR, type PortType } from "./canvas-context";

/** 노드 머리 아이콘 바탕: 이미지는 하늘색, 영상은 보라, 결과 리스트는 옅은 하늘색 */
export const TINT = { image: "rgb(30 167 255 / 0.16)", video: "rgb(164 139 255 / 0.18)", media: "rgb(108 200 255 / 0.14)" } as const;

export function Port({ type, id, port, top, label }: { type: "source" | "target"; id: string; port: PortType; top?: number | string; label?: string }) {
  return (
    <Handle
      type={type}
      id={id}
      position={type === "source" ? Position.Right : Position.Left}
      className="!size-3 !border-2 !border-[var(--bg)] transition-transform hover:!scale-125"
      style={{ background: PORT_COLOR[port], top }}
      title={label}
    />
  );
}

/** 포트 옆 작은 이름 (한글이라 자간을 벌리지 않아요) */
export function PortLabel({ side, top, children, className }: { side: "left" | "right"; top: number | string; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn("pointer-events-none absolute -translate-y-1/2 whitespace-nowrap text-[10px] text-fg-4", side === "left" ? "left-3" : "right-3", className)}
      style={{ top }}
    >
      {children}
    </span>
  );
}

export function Shell({
  selected,
  icon,
  title,
  accent,
  children,
  className,
  right,
  running,
}: {
  running?: boolean;
  selected?: boolean;
  icon: React.ReactNode;
  title: React.ReactNode;
  accent?: string;
  children: React.ReactNode;
  className?: string;
  right?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative flex flex-col rounded-2xl border bg-panel/92 shadow-[var(--shadow-soft)] backdrop-blur-xl transition-[border,box-shadow]",
        selected ? "border-accent/60 shadow-[0_0_0_4px_rgb(30_167_255/0.12),var(--shadow-soft)]" : "border-line-2 hover:border-line-3",
        running && "node-running",
        className,
      )}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2">
        <span className="flex size-6 items-center justify-center rounded-lg text-fg-2 [&_svg]:size-3.5" style={{ background: accent ?? "var(--panel-3)" }}>
          {icon}
        </span>
        <span className="flex-1 truncate text-[12.5px] font-semibold">{title}</span>
        {right}
      </div>
      {children}
    </div>
  );
}
