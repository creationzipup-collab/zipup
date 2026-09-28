"use client";

import { motion } from "motion/react";
import { AlertTriangle, ArrowDownToLine, ArrowRightToLine, Grid2x2, List, Plus, X } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { LiveDot, Ticker } from "@/components/brand/hud";
import type { LightboxItem } from "@/components/assets/lightbox";
import { MediaThumb } from "@/components/assets/media";
import { VERDICT_STYLE, VerdictBadge } from "@/components/assets/selection-controls";
import type { RefAsset } from "@/components/studio/reference-slots";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/controls";
import { Tip } from "@/components/ui/menu";
import { TimeAgo } from "@/components/ui/misc";
import { downloadUrl, downloadZip, useAssetMutations } from "@/lib/client/assets";
import { getModel } from "@/lib/models/registry";
import type { CanvasResult } from "@/lib/services/canvas";
import { ACTIVE_STATUSES, FLAG_LABEL, type Flag } from "@/lib/types";
import { cn } from "@/lib/utils";

import { PORT_COLOR } from "./canvas-context";

export type { CanvasResult };
type Output = CanvasResult["outputs"][number];

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
  outputs: Output[];
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

export function toRefAsset(o: Output): RefAsset {
  return { id: o.id, kind: o.kind, filename: o.filename, width: o.width, height: o.height, durationSec: o.durationSec, urls: o.urls };
}

const ratio = (o: Output) => (o.width && o.height ? Math.min(16 / 9, Math.max(9 / 16, o.width / o.height)) : 1);

type Kind = "all" | "image" | "video";
type View = "grid" | "list";
const VIEW_KEY = "zipup-canvas-results-view";

/**
 * 캔버스 결과 모음: 이 캔버스에서 나온 모든 결과를 실행 순서대로.
 * 고르면 그 노드가 다음 노드로 넘기는 결과가 바뀌고, 끌어서 캔버스에 놓으면 입력 노드가 돼요.
 */
export function ResultsPanel({
  runs,
  loading,
  hasMore,
  onMore,
  me,
  canEdit,
  nodeExists,
  nodeLabel,
  filterNode,
  onFilterNode,
  chosen,
  onPick,
  onPlace,
  onFocusNode,
  onOpen,
  onClose,
}: {
  runs: ResultRun[];
  loading: boolean;
  hasMore: boolean;
  onMore: () => void;
  me: string;
  canEdit: boolean;
  nodeExists: (id: string) => boolean;
  nodeLabel: (id: string) => string;
  filterNode: string | null;
  onFilterNode: (id: string | null) => void;
  /** 노드 id → 지금 다음 노드로 넘어가는 결과 id */
  chosen: Map<string, string>;
  onPick: (run: ResultRun, assetId: string) => void;
  onPlace: (asset: RefAsset, nodeId: string | null) => void;
  onFocusNode: (nodeId: string) => void;
  onOpen: (items: LightboxItem[], index: number) => void;
  onClose: () => void;
}) {
  const { update } = useAssetMutations();
  const [kind, setKind] = React.useState<Kind>("all");
  const [okOnly, setOkOnly] = React.useState(false);
  const [view, setViewState] = React.useState<View>("grid");
  const [flags, setFlags] = React.useState<Record<string, Flag | null>>({});
  const [zipping, setZipping] = React.useState(false);

  // 보기 방식은 이 브라우저에 기억 (마운트 후에만 읽음)
  React.useEffect(() => {
    try {
      const v = localStorage.getItem(VIEW_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (v === "grid" || v === "list") setViewState(v);
    } catch {}
  }, []);
  const setView = (v: View) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {}
  };

  const flagOf = (o: Output): Flag | null => (o.id in flags ? flags[o.id] : o.flag);
  const setFlag = (o: Output, f: Flag | null) => {
    setFlags((m) => ({ ...m, [o.id]: f }));
    void update([o.id], { flag: f });
  };

  const scoped = filterNode ? runs.filter((r) => r.nodeId === filterNode) : runs;
  const shown = scoped
    .filter((r) => kind === "all" || r.kind === kind)
    .map((r) => (okOnly ? { ...r, outputs: r.outputs.filter((o) => flagOf(o) === "pick"), pending: 0, failed: null } : r))
    .filter((r) => r.outputs.length || r.pending || r.failed);
  const flat = shown.flatMap((r) => r.outputs);
  const all = scoped.flatMap((r) => r.outputs);
  const running = scoped.filter((r) => r.running).length;

  const open = (o: Output) => {
    const i = flat.findIndex((x) => x.id === o.id);
    onOpen(flat.map(toRefAsset), Math.max(0, i));
  };

  async function zip() {
    if (!flat.length) return;
    setZipping(true);
    try {
      await downloadZip(
        flat.map((o) => ({ url: o.urls.download, filename: o.filename })),
        `canvas-results-${flat.length}.zip`,
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setZipping(false);
    }
  }

  return (
    <motion.aside
      initial={{ opacity: 0, x: 28 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 28 }}
      transition={{ type: "spring", stiffness: 380, damping: 36 }}
      className="glass-strong absolute bottom-3 right-3 top-[68px] z-20 flex w-[min(392px,calc(100%-24px))] flex-col overflow-hidden rounded-2xl !bg-[rgb(8_11_15/0.95)] shadow-[var(--shadow-pop)]"
      aria-label="결과 모음"
    >
      <span aria-hidden className="glow-line absolute inset-x-8 top-0 h-px opacity-60" />

      {/* 머리: 개수 */}
      <div className="flex items-start gap-3 px-4 pb-3 pt-4">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 font-mono text-[10.5px] tracking-[0.16em] text-fg-4">
            RESULTS
            {running > 0 && (
              <span className="inline-flex items-center gap-1.5 tracking-normal text-accent">
                <LiveDot /> <span className="font-sans text-[11px]">{running}개 생성 중</span>
              </span>
            )}
          </p>
          <div className="mt-2 flex items-end gap-3">
            <Ticker value={all.length} className="num text-[46px] text-fg" />
            <div className="pb-1 text-[12px] leading-snug">
              <p className="font-medium text-fg-2">결과 모음</p>
              <p className="text-fg-4">
                이미지 {all.filter((o) => o.kind === "image").length} · 영상 {all.filter((o) => o.kind === "video").length} · 실행 {scoped.length}번
              </p>
            </div>
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="결과 모음 닫기" className="rounded-lg p-1.5 text-fg-4 transition hover:bg-white/[0.06] hover:text-fg">
          <X className="size-4" />
        </button>
      </div>

      {/* 거르기 */}
      <div className="flex items-center gap-1.5 border-y border-line px-4 py-2">
        <Segmented
          size="xs"
          value={kind}
          onChange={setKind}
          layoutId="canvas-results-kind"
          options={[
            { value: "all", label: "전체" },
            { value: "image", label: "이미지" },
            { value: "video", label: "영상" },
          ]}
        />
        <button
          type="button"
          onClick={() => setOkOnly((v) => !v)}
          aria-pressed={okOnly}
          className={cn(
            "h-7 rounded-full border px-2.5 font-mono text-[10.5px] font-semibold tracking-[0.08em] transition",
            okOnly ? VERDICT_STYLE.pick.on : "border-line-2 text-fg-3 hover:border-line-3 hover:text-fg",
          )}
        >
          OK만
        </button>
        <span className="flex-1" />
        <Segmented
          size="xs"
          value={view}
          onChange={setView}
          layoutId="canvas-results-view"
          options={[
            { value: "grid", label: <Grid2x2 className="size-3.5" />, hint: "크게 보기" },
            { value: "list", label: <List className="size-3.5" />, hint: "목록으로 보기" },
          ]}
        />
      </div>

      {filterNode && (
        <div className="flex items-center gap-2 px-4 pt-3">
          <button
            type="button"
            onClick={() => onFilterNode(null)}
            className="inline-flex h-7 min-w-0 items-center gap-2 rounded-full border border-accent/40 bg-accent/10 pl-2.5 pr-2 text-[11.5px] text-accent transition hover:bg-accent/15"
          >
            <span className="truncate">{nodeLabel(filterNode)} 결과만</span>
            <X className="size-3 shrink-0" />
          </button>
          <button type="button" onClick={() => onFocusNode(filterNode)} className="text-[11.5px] text-fg-4 transition hover:text-fg-2">
            노드 보기
          </button>
        </div>
      )}

      {/* 실행 타임라인 */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-2 pt-4 scrollbar-thin">
        {loading && !runs.length ? (
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-28 rounded-xl" />
            ))}
          </div>
        ) : !shown.length ? (
          <div className="corners flex flex-col items-center gap-1.5 rounded-xl px-6 py-10 text-center">
            <p className="text-[13px] font-medium text-fg-2">{okOnly ? "OK로 고른 결과가 없어요" : filterNode ? "이 노드는 아직 결과가 없어요" : "아직 결과가 없어요"}</p>
            <p className="text-[11.5px] leading-relaxed text-fg-4">
              {okOnly ? "결과에 마우스를 올려 OK를 누르면 여기 모여요." : "생성 노드를 실행하면 실행한 순서대로 여기 쌓여요."}
            </p>
          </div>
        ) : (
          <ol className="flex flex-col">
            {shown.map((r, i) => (
              <RunItem
                key={r.key}
                run={r}
                last={i === shown.length - 1}
                me={me}
                view={view}
                label={r.nodeId && nodeExists(r.nodeId) ? nodeLabel(r.nodeId) : "지운 노드"}
                alive={!!r.nodeId && nodeExists(r.nodeId)}
                canEdit={canEdit}
                chosenId={r.nodeId ? chosen.get(r.nodeId) : undefined}
                flagOf={flagOf}
                onFlag={setFlag}
                onOpen={open}
                onPick={(o) => onPick(r, o.id)}
                onPlace={(o) => onPlace(toRefAsset(o), r.nodeId)}
                onFocus={() => r.nodeId && onFocusNode(r.nodeId)}
                onOnlyThis={() => r.nodeId && onFilterNode(r.nodeId)}
                filtered={!!filterNode}
              />
            ))}
          </ol>
        )}
        {hasMore && !okOnly && (
          <button type="button" onClick={onMore} className="mb-2 mt-1 w-full rounded-lg border border-dashed border-line-2 py-2 text-[11.5px] text-fg-3 transition hover:border-line-3 hover:text-fg">
            이전 결과 더 보기
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-line px-4 py-2.5">
        <p className="min-w-0 flex-1 truncate text-[11px] text-fg-4">{canEdit ? "끌어서 캔버스에 놓으면 입력 노드가 돼요" : "보기 전용"}</p>
        <Button size="xs" variant="ghost" loading={zipping} disabled={!flat.length} onClick={zip}>
          {!zipping && <ArrowDownToLine />} {flat.length}개 받기
        </Button>
      </div>
    </motion.aside>
  );
}

function RunItem({
  run,
  last,
  me,
  view,
  label,
  alive,
  canEdit,
  chosenId,
  flagOf,
  onFlag,
  onOpen,
  onPick,
  onPlace,
  onFocus,
  onOnlyThis,
  filtered,
}: {
  run: ResultRun;
  last: boolean;
  me: string;
  view: View;
  label: string;
  alive: boolean;
  canEdit: boolean;
  chosenId: string | undefined;
  flagOf: (o: Output) => Flag | null;
  onFlag: (o: Output, f: Flag | null) => void;
  onOpen: (o: Output) => void;
  onPick: (o: Output) => void;
  onPlace: (o: Output) => void;
  onFocus: () => void;
  onOnlyThis: () => void;
  filtered: boolean;
}) {
  const model = getModel(run.modelId);
  const color = PORT_COLOR[run.kind];
  const single = run.outputs.length + run.pending === 1;
  return (
    <li className="relative pb-5 pl-6">
      {/* 타임라인 선과 점 */}
      {!last && <span aria-hidden className="absolute bottom-0 left-[4px] top-4 w-px bg-gradient-to-b from-line-2 to-line" />}
      <span aria-hidden className="absolute left-0 top-[5px] flex size-[9px] items-center justify-center">
        {run.running ? (
          <LiveDot />
        ) : (
          <span className={cn("size-[9px] rounded-full border-2 border-[var(--panel)]", run.failed && "!bg-danger")} style={{ background: run.failed ? undefined : color, boxShadow: run.failed ? undefined : `0 0 10px ${color}66` }} />
        )}
      </span>

      <div className="flex items-start gap-2">
        <button type="button" onClick={onFocus} disabled={!alive} className="group/h min-w-0 flex-1 text-left disabled:cursor-default">
          <p className="flex min-w-0 items-baseline gap-1.5">
            <span className={cn("truncate text-[12.5px] font-medium transition", alive ? "text-fg group-hover/h:text-accent" : "text-fg-3")}>{label}</span>
            {model && <span className="shrink-0 truncate text-[11px] text-fg-4">{model.name}</span>}
          </p>
          {run.prompt && <p className="mt-0.5 line-clamp-1 text-[11.5px] text-fg-3">{run.prompt}</p>}
        </button>
        <div className="flex shrink-0 flex-col items-end gap-0.5 pt-px text-[11px] text-fg-4">
          <TimeAgo date={run.createdAt} />
          {run.userId !== me && <span className="text-fg-3">{run.userName}</span>}
        </div>
      </div>

      {run.failed ? (
        <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-danger/25 bg-danger/[0.06] px-2.5 py-2 text-[11.5px] leading-snug text-danger">
          <AlertTriangle className="mt-px size-3.5 shrink-0" /> {run.failed}
        </p>
      ) : view === "grid" ? (
        <div className="mt-2.5 grid grid-cols-2 gap-1.5">
          {run.outputs.map((o) => (
            <Tile
              key={o.id}
              o={o}
              span={single}
              chosen={chosenId === o.id}
              flag={flagOf(o)}
              canPick={canEdit && alive}
              canPlace={canEdit}
              onFlag={(f) => onFlag(o, f)}
              onOpen={() => onOpen(o)}
              onPick={() => onPick(o)}
              onPlace={() => onPlace(o)}
            />
          ))}
          {Array.from({ length: run.pending }, (_, i) => (
            <div key={`p${i}`} className={cn("generating rounded-xl border border-line", single && "col-span-2")} style={{ aspectRatio: run.kind === "video" ? 16 / 9 : 1 }} />
          ))}
        </div>
      ) : (
        <ul className="mt-2 flex flex-col gap-0.5">
          {run.outputs.map((o) => (
            <Row
              key={o.id}
              o={o}
              chosen={chosenId === o.id}
              flag={flagOf(o)}
              canPick={canEdit && alive}
              canPlace={canEdit}
              onFlag={(f) => onFlag(o, f)}
              onOpen={() => onOpen(o)}
              onPick={() => onPick(o)}
              onPlace={() => onPlace(o)}
            />
          ))}
          {run.pending > 0 && (
            <li className="flex items-center gap-2.5 p-1.5">
              <span className="generating size-11 shrink-0 rounded-md" />
              <span className="text-[11.5px] text-fg-3">{run.pending}개 만드는 중</span>
            </li>
          )}
        </ul>
      )}

      {!filtered && alive && run.outputs.length > 0 && (
        <button type="button" onClick={onOnlyThis} className="mt-1.5 text-[11px] text-fg-4 transition hover:text-fg-2">
          이 노드 결과만 보기
        </button>
      )}
    </li>
  );
}

type ItemProps = {
  o: Output;
  chosen: boolean;
  flag: Flag | null;
  canPick: boolean;
  canPlace: boolean;
  onFlag: (f: Flag | null) => void;
  onOpen: () => void;
  onPick: () => void;
  onPlace: () => void;
};

function dragAsset(e: React.DragEvent, o: Output) {
  e.dataTransfer.setData("application/x-zipup-asset", JSON.stringify(toRefAsset(o)));
  e.dataTransfer.effectAllowed = "copy";
}

function Tile({ o, span, chosen, flag, canPick, canPlace, onFlag, onOpen, onPick, onPlace }: ItemProps & { span: boolean }) {
  return (
    <div
      draggable={canPlace}
      onDragStart={(e) => dragAsset(e, o)}
      className={cn(
        "group relative overflow-hidden rounded-xl border bg-panel-2 transition-[border-color,box-shadow]",
        chosen ? "border-accent/70 shadow-[0_0_0_3px_rgb(30_167_255/0.16),0_0_24px_-6px_var(--accent-glow)]" : "border-line hover:border-line-3",
        span && "col-span-2",
      )}
      style={{ aspectRatio: ratio(o) }}
    >
      <button type="button" onClick={onOpen} className="block size-full" aria-label={`${o.filename} 크게 보기`}>
        <MediaThumb kind={o.kind} thumb={o.urls.thumb} src={o.urls.src} durationSec={o.durationSec} />
      </button>
      {flag && (
        <div className="pointer-events-none absolute left-1.5 top-1.5 transition-opacity group-hover:opacity-0">
          <VerdictBadge flag={flag} />
        </div>
      )}
      {chosen && (
        <span className="pointer-events-none absolute right-1.5 top-1.5 inline-flex h-[18px] items-center rounded-[5px] bg-accent px-1.5 text-[10px] font-semibold text-on-accent shadow">
          다음 노드로
        </span>
      )}
      <VerdictButtons flag={flag} onFlag={onFlag} className="absolute left-1.5 top-1.5 opacity-0 transition group-hover:opacity-100" />
      <div className="absolute bottom-1.5 right-1.5 flex gap-1 opacity-0 transition group-hover:opacity-100">
        <Actions o={o} chosen={chosen} canPick={canPick} canPlace={canPlace} onPick={onPick} onPlace={onPlace} />
      </div>
    </div>
  );
}

function Row({ o, chosen, flag, canPick, canPlace, onFlag, onOpen, onPick, onPlace }: ItemProps) {
  return (
    <li
      draggable={canPlace}
      onDragStart={(e) => dragAsset(e, o)}
      className={cn("group flex items-center gap-2.5 rounded-lg border p-1.5 pr-2 transition", chosen ? "border-accent/45 bg-accent/[0.06]" : "border-transparent hover:bg-white/[0.035]")}
    >
      <button type="button" onClick={onOpen} className="relative size-11 shrink-0 overflow-hidden rounded-md bg-panel-2" aria-label={`${o.filename} 크게 보기`}>
        <MediaThumb kind={o.kind} thumb={o.urls.thumb} src={o.urls.src} autoPlayOnHover={false} />
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-[10.5px] text-fg-2">{o.filename}</p>
        <p className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-fg-4">
          {o.width && o.height ? `${o.width}×${o.height}` : o.kind === "image" ? "이미지" : "영상"}
          {o.durationSec ? ` · ${Math.round(o.durationSec)}초` : ""}
          {chosen && <span className="text-accent">· 다음 노드로</span>}
        </p>
      </div>
      <div className="relative flex items-center">
        {flag && <VerdictBadge flag={flag} className="transition-opacity group-hover:opacity-0" />}
        <div className="absolute right-0 flex gap-1 opacity-0 transition group-hover:opacity-100">
          <VerdictButtons flag={flag} onFlag={onFlag} />
          <Actions o={o} chosen={chosen} canPick={canPick} canPlace={canPlace} onPick={onPick} onPlace={onPlace} />
        </div>
      </div>
    </li>
  );
}

function VerdictButtons({ flag, onFlag, className }: { flag: Flag | null; onFlag: (f: Flag | null) => void; className?: string }) {
  return (
    <div className={cn("flex gap-1", className)}>
      {(["pick", "keep", "reject"] as const).map((f) => (
        <Tip key={f} content={f === "pick" ? "OK — 쓸 결과" : f === "keep" ? "KEEP — 보류" : "NG — 안 씀"}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onFlag(flag === f ? null : f);
            }}
            className={cn(
              "h-6 rounded-md px-1.5 font-mono text-[9.5px] font-bold tracking-[0.06em] backdrop-blur transition",
              flag === f ? VERDICT_STYLE[f].solid : "bg-black/55 text-white/80 hover:bg-black/75",
            )}
          >
            {FLAG_LABEL[f]}
          </button>
        </Tip>
      ))}
    </div>
  );
}

function Actions({ o, chosen, canPick, canPlace, onPick, onPlace }: { o: Output; chosen: boolean; canPick: boolean; canPlace: boolean; onPick: () => void; onPlace: () => void }) {
  return (
    <>
      {canPick && !chosen && (
        <ActionButton label="이 결과를 다음 노드로 넘기기" onClick={onPick}>
          <ArrowRightToLine />
        </ActionButton>
      )}
      {canPlace && (
        <ActionButton label="캔버스에 꺼내기 — 끌어서 놓아도 돼요" onClick={onPlace}>
          <Plus />
        </ActionButton>
      )}
      <ActionButton label="다운로드" onClick={() => downloadUrl(o.urls.download, o.filename)}>
        <ArrowDownToLine />
      </ActionButton>
    </>
  );
}

function ActionButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tip content={label}>
      <button
        type="button"
        aria-label={label}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        className="flex size-6 items-center justify-center rounded-md bg-black/55 text-white/85 backdrop-blur transition hover:bg-black/80 hover:text-white [&_svg]:size-3.5"
      >
        {children}
      </button>
    </Tip>
  );
}
