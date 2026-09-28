"use client";

import { AlertTriangle, ArrowDownToLine, Plus } from "lucide-react";
import * as React from "react";

import { LiveDot } from "@/components/brand/hud";
import type { LightboxItem } from "@/components/assets/lightbox";
import { MediaThumb } from "@/components/assets/media";
import { VERDICT_STYLE, VerdictBadge } from "@/components/assets/selection-controls";
import type { RefAsset } from "@/components/studio/reference-slots";
import { Tip } from "@/components/ui/menu";
import { TimeAgo } from "@/components/ui/misc";
import { downloadUrl } from "@/lib/client/assets";
import { getModel } from "@/lib/models/registry";
import type { CanvasResult } from "@/lib/services/canvas";
import { ACTIVE_STATUSES, FLAG_LABEL, type Flag } from "@/lib/types";
import { cn } from "@/lib/utils";

export type { CanvasResult };
export type ResultOutput = CanvasResult["outputs"][number];

/** 한 번 실행(같은 요청)에서 나온 결과 묶음 */
export type ResultRun = {
  key: string;
  nodeId: string | null;
  kind: "image" | "video";
  modelId: string;
  prompt: string;
  createdAt: string;
  userId: string;
  userName: string;
  generationIds: string[];
  outputs: ResultOutput[];
  /** 아직 안 나온 결과 수 (생성 중) */
  pending: number;
  running: boolean;
  /** 결과 없이 끝났을 때 이유 */
  failed: string | null;
};

/** 최신 순 실행 목록 → 실행 묶음 (같은 batch + 같은 노드) */
export function groupRuns(items: CanvasResult[]): ResultRun[] {
  const map = new Map<string, { run: ResultRun; gens: CanvasResult[] }>();
  for (const g of items) {
    const key = `${g.batchId}:${g.canvasNodeId ?? ""}`;
    let entry = map.get(key);
    if (!entry) {
      entry = {
        run: {
          key,
          nodeId: g.canvasNodeId,
          kind: g.kind,
          modelId: g.modelId,
          prompt: g.prompt,
          createdAt: g.createdAt,
          userId: g.userId,
          userName: g.userName,
          generationIds: [],
          outputs: [],
          pending: 0,
          running: false,
          failed: null,
        },
        gens: [],
      };
      map.set(key, entry);
    }
    entry.gens.push(g);
  }
  return Array.from(map.values()).map(({ run, gens }) => {
    const ordered = [...gens].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const active = ordered.filter((g) => ACTIVE_STATUSES.includes(g.status));
    const outputs = ordered.flatMap((g) => g.outputs);
    return {
      ...run,
      generationIds: ordered.map((g) => g.id),
      outputs,
      running: active.length > 0,
      pending: active.reduce((s, g) => s + Math.max(0, g.expectedOutputs - g.outputs.length), 0),
      failed: !outputs.length && !active.length ? ordered.find((g) => g.errorMessage)?.errorMessage ?? "결과 없이 끝났어요." : null,
    };
  });
}

export function toRefAsset(o: ResultOutput): RefAsset {
  return { id: o.id, kind: o.kind, filename: o.filename, width: o.width, height: o.height, durationSec: o.durationSec, urls: o.urls };
}

const RUN_DOT = { image: "#1ea7ff", video: "#a48bff" } as const;
const ratio = (o: ResultOutput) => (o.width && o.height ? Math.min(16 / 9, Math.max(9 / 16, o.width / o.height)) : 1);

/**
 * 결과 목록: 실행마다 한 줄 머리(어느 노드·모델·언제) + 결과 격자.
 * NG는 흐리게, OK는 하늘색 테두리. 끌어서 캔버스에 놓으면 입력 노드가 돼요.
 */
export function ResultsBoard({
  runs,
  only,
  me,
  canEdit,
  labelOf,
  aliveOf,
  flagOf,
  onFlag,
  onOpen,
  onPlace,
}: {
  runs: ResultRun[];
  only: "all" | "ok";
  me: string;
  canEdit: boolean;
  labelOf: (nodeId: string) => string;
  aliveOf: (nodeId: string) => boolean;
  flagOf: (o: ResultOutput) => Flag | null;
  onFlag: (o: ResultOutput, f: Flag | null) => void;
  onOpen: (items: LightboxItem[], index: number) => void;
  onPlace: (o: ResultOutput) => void;
}) {
  const shown = runs
    .map((r) => (only === "ok" ? { ...r, outputs: r.outputs.filter((o) => flagOf(o) === "pick"), pending: 0, failed: null } : r))
    .filter((r) => r.outputs.length || r.pending || r.failed);
  const flat = shown.flatMap((r) => r.outputs);
  const open = (o: ResultOutput) => onOpen(flat.map(toRefAsset), Math.max(0, flat.findIndex((x) => x.id === o.id)));

  if (!shown.length) return null;
  return (
    <ol className="flex flex-col gap-4">
      {shown.map((r) => {
        const model = getModel(r.modelId);
        const alive = !!r.nodeId && aliveOf(r.nodeId);
        return (
          <li key={r.key} className="flex flex-col gap-1.5">
            <div className="flex min-w-0 items-center gap-1.5 text-[11px]">
              {r.running ? (
                <LiveDot />
              ) : (
                <span className={cn("size-1.5 shrink-0 rounded-full", r.failed && "bg-danger")} style={r.failed ? undefined : { background: RUN_DOT[r.kind], boxShadow: `0 0 8px ${RUN_DOT[r.kind]}88` }} />
              )}
              <span className={cn("shrink-0 font-medium", alive ? "text-fg-2" : "text-fg-4")}>{r.nodeId && alive ? labelOf(r.nodeId) : "지운 노드"}</span>
              {model && <span className="min-w-0 truncate text-fg-4">{model.name}</span>}
              <span className="ml-auto flex shrink-0 items-center gap-1.5 text-fg-4">
                {r.userId !== me && <span className="text-fg-3">{r.userName}</span>}
                <TimeAgo date={r.createdAt} />
              </span>
            </div>
            {r.failed ? (
              <p className="flex items-start gap-1.5 rounded-lg border border-danger/25 bg-danger/[0.06] px-2 py-1.5 text-[11px] leading-snug text-danger">
                <AlertTriangle className="mt-px size-3 shrink-0" /> {r.failed}
              </p>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(92px,1fr))] gap-1.5">
                {r.outputs.map((o) => (
                  <Tile key={o.id} o={o} flag={flagOf(o)} canEdit={canEdit} onFlag={(f) => onFlag(o, f)} onOpen={() => open(o)} onPlace={() => onPlace(o)} />
                ))}
                {Array.from({ length: r.pending }, (_, i) => (
                  <div key={`p${i}`} className="generating rounded-lg border border-line" style={{ aspectRatio: r.kind === "video" ? 16 / 9 : 1 }} />
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function Tile({ o, flag, canEdit, onFlag, onOpen, onPlace }: { o: ResultOutput; flag: Flag | null; canEdit: boolean; onFlag: (f: Flag | null) => void; onOpen: () => void; onPlace: () => void }) {
  return (
    <div
      draggable={canEdit}
      onDragStart={(e) => {
        e.dataTransfer.setData("application/x-zipup-asset", JSON.stringify(toRefAsset(o)));
        e.dataTransfer.effectAllowed = "copy";
      }}
      className={cn(
        "group relative overflow-hidden rounded-lg border bg-panel-2 transition-[border-color,box-shadow,opacity]",
        flag === "pick" ? "border-accent/70 shadow-[0_0_0_2px_rgb(30_167_255/0.18),0_0_18px_-6px_var(--accent-glow)]" : "border-line hover:border-line-3",
        flag === "reject" && "opacity-40 hover:opacity-100",
      )}
      style={{ aspectRatio: ratio(o) }}
    >
      <button type="button" onClick={onOpen} className="block size-full" aria-label={`${o.filename} 크게 보기`}>
        <MediaThumb kind={o.kind} thumb={o.urls.thumb} src={o.urls.src} durationSec={o.durationSec} autoPlayOnHover={false} />
      </button>
      {flag && (
        <div className="pointer-events-none absolute left-1 top-1 transition-opacity group-hover:opacity-0">
          <VerdictBadge flag={flag} />
        </div>
      )}
      <div className="absolute left-1 top-1 flex gap-0.5 opacity-0 transition group-hover:opacity-100">
        {(["pick", "keep", "reject"] as const).map((f) => (
          <Tip key={f} content={f === "pick" ? "OK — 다음 노드로 넘어가요" : f === "keep" ? "KEEP — 보류" : "NG — 안 씀"}>
            <button
              type="button"
              disabled={!canEdit}
              onClick={(e) => {
                e.stopPropagation();
                onFlag(flag === f ? null : f);
              }}
              className={cn(
                "h-5 rounded-[5px] px-1 font-mono text-[9px] font-bold tracking-[0.04em] backdrop-blur transition disabled:opacity-50",
                flag === f ? VERDICT_STYLE[f].solid : "bg-black/60 text-white/85 hover:bg-black/80",
              )}
            >
              {FLAG_LABEL[f]}
            </button>
          </Tip>
        ))}
      </div>
      <div className="absolute bottom-1 right-1 flex gap-0.5 opacity-0 transition group-hover:opacity-100">
        {canEdit && (
          <TileAction label="캔버스에 꺼내기 — 끌어서 놓아도 돼요" onClick={onPlace}>
            <Plus />
          </TileAction>
        )}
        <TileAction label="다운로드" onClick={() => downloadUrl(o.urls.download, o.filename)}>
          <ArrowDownToLine />
        </TileAction>
      </div>
    </div>
  );
}

function TileAction({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tip content={label}>
      <button
        type="button"
        aria-label={label}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        className="flex size-5 items-center justify-center rounded-[5px] bg-black/60 text-white/85 backdrop-blur transition hover:bg-black/85 hover:text-white [&_svg]:size-3"
      >
        {children}
      </button>
    </Tip>
  );
}
