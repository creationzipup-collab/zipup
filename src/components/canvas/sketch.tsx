"use client";

import { useReactFlow, useViewport, ViewportPortal } from "@xyflow/react";
import { Eraser, Hand, MousePointer2, Pencil, Trash2, Zap } from "lucide-react";
import { getStroke } from "perfect-freehand";
import * as React from "react";

import { Tip } from "@/components/ui/menu";
import { cn, randomId } from "@/lib/utils";

export type Stroke = {
  id: string;
  color: string;
  size: number;
  /** [x, y, pressure] — 캔버스 좌표 */
  points: number[][];
  author?: { id: string; name: string } | null;
};

/** 레이저: 잠깐 보였다 사라지는 선 (저장 안 함) */
export type LaserStroke = { id: string; color: string; points: number[][]; endedAt: number | null; author?: string };

export type SketchMode = "select" | "pan" | "pen" | "laser" | "eraser";

export const SKETCH_COLORS = ["#1ea7ff", "#eef4fa", "#a48bff", "#f5b83d", "#3ddc97"];

const round = (n: number) => Math.round(n * 10) / 10;

/** perfect-freehand 외곽선 → SVG path */
export function strokePath(points: number[][], size: number, pressure = true): string {
  if (!points.length) return "";
  const outline = getStroke(points, { size, thinning: pressure ? 0.55 : 0.35, smoothing: 0.55, streamline: 0.45, simulatePressure: !pressure, last: true });
  if (outline.length < 2) return "";
  const d = outline.reduce<(string | number)[]>(
    (acc, [x0, y0], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length];
      acc.push(round(x0), round(y0), round((x0 + x1) / 2), round((y0 + y1) / 2));
      return acc;
    },
    ["M", ...outline[0].map(round), "Q"],
  );
  return `${d.join(" ")} Z`;
}

function hasPressure(points: number[][]) {
  return points.some((p) => p[2] !== undefined && p[2] !== 0.5);
}

/** 캔버스 좌표에 그려지는 스케치 (확대·이동을 따라감) */
export function SketchStrokes({ strokes, live, lasers }: { strokes: Stroke[]; live: Stroke[]; lasers: LaserStroke[] }) {
  const [now, setNow] = React.useState(0);
  const fading = lasers.some((l) => l.endedAt);
  React.useEffect(() => {
    if (!fading) return;
    let raf = 0;
    const tick = () => {
      setNow(performance.now());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [fading]);

  return (
    <ViewportPortal>
      <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width={1} height={1} style={{ zIndex: 5 }}>
        {[...strokes, ...live].map((s) => (
          <path key={s.id} d={strokePath(s.points, s.size, hasPressure(s.points))} fill={s.color} opacity={0.95} />
        ))}
        {lasers.map((l) => {
          const age = l.endedAt && now ? now - l.endedAt : 0;
          const opacity = l.endedAt ? Math.max(0, 1 - age / 900) : 1;
          if (opacity <= 0) return null;
          const d = strokePath(l.points, 7, false);
          return (
            <g key={l.id} opacity={opacity}>
              <path d={d} fill={l.color} opacity={0.35} style={{ filter: "blur(6px)" }} />
              <path d={d} fill={l.color} />
            </g>
          );
        })}
      </svg>
    </ViewportPortal>
  );
}

/** 그리기 모드일 때 캔버스 위를 덮어 포인터를 받는 층 */
export function SketchCapture({
  mode,
  color,
  size,
  strokes,
  me,
  onLive,
  onCommit,
  onLaser,
  onErase,
}: {
  mode: SketchMode;
  color: string;
  size: number;
  strokes: Stroke[];
  me: { id: string; name: string };
  onLive: (s: Stroke | null) => void;
  onCommit: (s: Stroke) => void;
  onLaser: (l: LaserStroke) => void;
  onErase: (ids: string[]) => void;
}) {
  const rf = useReactFlow();
  const { zoom } = useViewport();
  const drawing = React.useRef<{ id: string; points: number[][] } | null>(null);

  if (mode !== "pen" && mode !== "laser" && mode !== "eraser") return null;

  const toFlow = (e: { clientX: number; clientY: number; pressure: number; pointerType: string }) => {
    const p = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    return [round(p.x), round(p.y), e.pointerType === "pen" ? Math.round(e.pressure * 100) / 100 : 0.5];
  };

  const eraseAt = (x: number, y: number) => {
    const r = Math.max(10 / zoom, 6);
    const hit = strokes.filter((s) => s.points.some(([px, py]) => Math.hypot(px - x, py - y) < r + s.size / 2)).map((s) => s.id);
    if (hit.length) onErase(hit);
  };

  return (
    <div
      className={cn("absolute inset-0 z-[5] touch-none", mode === "eraser" ? "cursor-cell" : "cursor-crosshair")}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        const pt = toFlow(e);
        if (mode === "eraser") {
          drawing.current = { id: "erase", points: [pt] };
          eraseAt(pt[0], pt[1]);
          return;
        }
        drawing.current = { id: randomId(), points: [pt] };
        if (mode === "pen") onLive({ id: drawing.current.id, color, size, points: [pt], author: me });
        else onLaser({ id: drawing.current.id, color: "#ff3b30", points: [pt], endedAt: null, author: me.id });
      }}
      onPointerMove={(e) => {
        const d = drawing.current;
        if (!d) return;
        const events = typeof e.nativeEvent.getCoalescedEvents === "function" ? e.nativeEvent.getCoalescedEvents() : [e.nativeEvent];
        for (const ev of events.length ? events : [e.nativeEvent]) d.points.push(toFlow(ev));
        const last = d.points[d.points.length - 1];
        if (mode === "eraser") eraseAt(last[0], last[1]);
        else if (mode === "pen") onLive({ id: d.id, color, size, points: [...d.points], author: me });
        else onLaser({ id: d.id, color: "#ff3b30", points: [...d.points], endedAt: null, author: me.id });
      }}
      onPointerUp={() => {
        const d = drawing.current;
        drawing.current = null;
        if (!d || mode === "eraser") return;
        if (mode === "pen") {
          onLive(null);
          if (d.points.length > 1 || size > 2) onCommit({ id: d.id, color, size, points: d.points, author: me });
        } else onLaser({ id: d.id, color: "#ff3b30", points: d.points, endedAt: performance.now(), author: me.id });
      }}
    />
  );
}

export function SketchToolbar({
  mode,
  onMode,
  color,
  onColor,
  count,
  onClear,
  canEdit,
}: {
  mode: SketchMode;
  onMode: (m: SketchMode) => void;
  color: string;
  onColor: (c: string) => void;
  count: number;
  onClear: () => void;
  canEdit: boolean;
}) {
  const tools: { id: SketchMode; icon: React.ElementType; label: string; key: string; edit?: boolean }[] = [
    { id: "select", icon: MousePointer2, label: "선택", key: "V" },
    { id: "pan", icon: Hand, label: "화면 이동", key: "H" },
    { id: "pen", icon: Pencil, label: "펜 — 캔버스에 그려서 설명", key: "P", edit: true },
    { id: "laser", icon: Zap, label: "레이저 포인터 — 잠깐 보였다 사라짐", key: "L" },
    { id: "eraser", icon: Eraser, label: "지우개", key: "E", edit: true },
  ];
  return (
    <div className="glass flex items-center gap-0.5 rounded-2xl p-1 shadow-[var(--shadow-soft)]">
      {tools
        .filter((t) => canEdit || !t.edit)
        .map((t) => {
          const Icon = t.icon;
          return (
            <Tip key={t.id} content={t.label} shortcut={t.key}>
              <button
                type="button"
                onClick={() => onMode(t.id)}
                className={cn("relative flex size-9 items-center justify-center rounded-xl transition", mode === t.id ? "bg-inv text-inv-fg" : "text-fg-3 hover:bg-panel-3 hover:text-fg")}
              >
                <Icon className="size-[17px]" />
              </button>
            </Tip>
          );
        })}
      {(mode === "pen" || mode === "eraser") && canEdit && (
        <>
          <span className="mx-1 h-6 w-px bg-line-2" />
          {SKETCH_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`색 ${c}`}
              onClick={() => {
                onColor(c);
                if (mode !== "pen") onMode("pen");
              }}
              className={cn("mx-0.5 size-5 rounded-full border-2 transition", color === c && mode === "pen" ? "scale-110 border-fg" : "border-transparent hover:scale-110")}
              style={{ background: c }}
            />
          ))}
          <Tip content={`스케치 모두 지우기 (${count})`}>
            <button type="button" onClick={onClear} disabled={!count} className="ml-1 flex size-9 items-center justify-center rounded-xl text-fg-3 transition hover:bg-danger/10 hover:text-danger disabled:opacity-30">
              <Trash2 className="size-4" />
            </button>
          </Tip>
        </>
      )}
    </div>
  );
}
