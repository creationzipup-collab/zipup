"use client";

import { Handle, NodeResizer, Position, useReactFlow, type NodeProps } from "@xyflow/react";
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  Clapperboard,
  FolderOpen,
  ImageIcon,
  ImagePlus,
  ListOrdered,
  Loader2,
  Play,
  Plus,
  StickyNote,
  Type,
  Video,
  X,
} from "lucide-react";
import * as React from "react";

import { MediaThumb } from "@/components/assets/media";
import { ModelSwatch } from "@/components/studio/model-picker";
import { ParamControls } from "@/components/studio/param-controls";
import { Select } from "@/components/ui/controls";
import { Tip } from "@/components/ui/menu";
import { defaultParams, IMAGE_MODELS, sanitizeParams, VIDEO_MODELS } from "@/lib/models/registry";
import { GENERATION_STATUS_LABEL } from "@/lib/types";
import { cn, usd } from "@/lib/utils";

import { chosenOutput, PORT_COLOR, useCanvas, type AssetInputData, type GenData, type ListData, type NoteData, type PortType, type PromptData } from "./canvas-context";

/** 노드 머리 아이콘 바탕: 이미지는 하늘색, 영상은 보라 */
const TINT = { image: "rgb(30 167 255 / 0.16)", video: "rgb(164 139 255 / 0.18)" } as const;

function Port({ type, id, port, top, label }: { type: "source" | "target"; id: string; port: PortType; top?: number | string; label?: string }) {
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

function PortLabel({ side, top, children }: { side: "left" | "right"; top: number | string; children: React.ReactNode }) {
  return (
    <span
      className={cn("pointer-events-none absolute -translate-y-1/2 whitespace-nowrap font-mono text-[9.5px] uppercase tracking-wider text-fg-4", side === "left" ? "left-3" : "right-3")}
      style={{ top }}
    >
      {children}
    </span>
  );
}

function Shell({
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
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
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

/* --------------------------------- 텍스트 --------------------------------- */

export function PromptNode({ id, data, selected }: NodeProps) {
  const d = data as PromptData;
  const { updateNodeData } = useReactFlow();
  const { canEdit } = useCanvas();
  return (
    <Shell selected={selected} icon={<Type />} title="프롬프트" className="w-[300px]">
      <textarea
        value={d.text ?? ""}
        onChange={(e) => updateNodeData(id, { text: e.target.value })}
        readOnly={!canEdit}
        placeholder="장면을 설명하세요…"
        rows={5}
        className="nodrag nowheel w-full resize-y bg-transparent px-3 py-2.5 text-[12.5px] leading-relaxed outline-none placeholder:text-fg-4"
      />
      <Port type="source" id="text" port="text" top="50%" label="텍스트" />
    </Shell>
  );
}

/* --------------------------------- 리스트 --------------------------------- */

/** 반복 입력: 항목마다 한 번씩 연결된 생성 노드를 돌려요 (예: 카메라 앵글 5개 → 5컷) */
export function ListNode({ id, data, selected }: NodeProps) {
  const d = data as ListData;
  const { updateNodeData } = useReactFlow();
  const { canEdit, pickAsset, openAsset } = useCanvas();
  const mode = d.mode ?? "text";
  const items = d.items?.length ? d.items : [""];
  const assets = d.assets ?? [];
  const filled = mode === "text" ? items.filter((t) => t.trim()).length : assets.length;
  const refs = React.useRef<(HTMLInputElement | null)[]>([]);

  const setItems = (next: string[]) => updateNodeData(id, { items: next });
  const focus = (i: number) => requestAnimationFrame(() => refs.current[i]?.focus());

  return (
    <Shell
      selected={selected}
      icon={<ListOrdered />}
      title="반복 입력"
      className="w-[290px]"
      right={
        <span className="flex items-center gap-1.5">
          <span className="rounded-full bg-panel-3 px-1.5 font-mono text-[10.5px] text-fg-2">{filled}개</span>
          {canEdit && (
            <span className="nodrag flex rounded-md border border-line-2 p-0.5">
              {(["text", "image"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => updateNodeData(id, { mode: m })}
                  className={cn("rounded px-1.5 text-[10.5px] transition", mode === m ? "bg-inv text-inv-fg" : "text-fg-3 hover:text-fg")}
                >
                  {m === "text" ? "글" : "이미지"}
                </button>
              ))}
            </span>
          )}
        </span>
      }
    >
      {mode === "text" ? (
        <ol className="nodrag nowheel flex max-h-[280px] flex-col gap-1 overflow-y-auto p-2 scrollbar-thin">
          {items.map((t, i) => (
            <li key={i} className="group flex items-center gap-1.5">
              <span className="w-5 shrink-0 text-right font-mono text-[10px] text-fg-4">{i + 1}</span>
              <input
                ref={(el) => {
                  refs.current[i] = el;
                }}
                value={t}
                readOnly={!canEdit}
                placeholder={i === 0 ? "예: close-up, low angle" : "다음 항목"}
                onChange={(e) => setItems(items.map((x, j) => (j === i ? e.target.value : x)))}
                onPaste={(e) => {
                  const text = e.clipboardData.getData("text");
                  if (!text.includes("\n")) return;
                  e.preventDefault();
                  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
                  setItems([...items.slice(0, i), ...lines, ...items.slice(i + 1)].filter((x, j, arr) => x.trim() || j === arr.length - 1));
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    setItems([...items.slice(0, i + 1), "", ...items.slice(i + 1)]);
                    focus(i + 1);
                  } else if (e.key === "Backspace" && !t && items.length > 1) {
                    e.preventDefault();
                    setItems(items.filter((_, j) => j !== i));
                    focus(Math.max(0, i - 1));
                  }
                }}
                className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-panel-2/60 px-2 text-[12px] outline-none placeholder:text-fg-4 focus:border-line-3"
              />
              {canEdit && items.length > 1 && (
                <button type="button" onClick={() => setItems(items.filter((_, j) => j !== i))} className="rounded p-0.5 text-fg-4 opacity-0 transition hover:text-fg group-hover:opacity-100" aria-label="항목 삭제">
                  <X className="size-3" />
                </button>
              )}
            </li>
          ))}
          {canEdit && (
            <button type="button" onClick={() => (setItems([...items, ""]), focus(items.length))} className="ml-6 flex h-7 items-center gap-1 text-[11.5px] text-fg-4 hover:text-fg-2">
              <Plus className="size-3.5" /> 항목 추가 · 여러 줄 붙여넣기 가능
            </button>
          )}
        </ol>
      ) : (
        <div className="nodrag grid grid-cols-4 gap-1.5 p-2">
          {assets.map((a) => (
            <div key={a.id} className="group relative aspect-square overflow-hidden rounded-lg border border-line">
              <button type="button" className="block size-full" onClick={() => openAsset(a)}>
                <MediaThumb kind={a.kind} thumb={a.urls.thumb} src={a.urls.src} autoPlayOnHover={false} />
              </button>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => updateNodeData(id, { assets: assets.filter((x) => x.id !== a.id) })}
                  className="absolute right-0.5 top-0.5 flex size-4 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition group-hover:opacity-100"
                  aria-label="빼기"
                >
                  <X className="size-2.5" />
                </button>
              )}
            </div>
          ))}
          {canEdit && (
            <button
              type="button"
              onClick={() => pickAsset(id, "image", true)}
              className="flex aspect-square flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-line-3 text-fg-4 transition hover:border-fg-3 hover:text-fg-2"
            >
              <Plus className="size-4" />
              <span className="text-[9.5px]">추가</span>
            </button>
          )}
        </div>
      )}
      <p className="border-t border-line px-3 py-1.5 text-[10.5px] text-fg-4">연결한 생성 노드가 항목마다 한 번씩 돌아요 · 결과는 결과 모음에</p>
      <Port type="source" id={mode === "image" ? "image" : "text"} port={mode === "image" ? "image" : "text"} top="50%" label={mode === "image" ? "이미지 목록" : "텍스트 목록"} />
    </Shell>
  );
}

/* ---------------------------------- 메모 ---------------------------------- */

export function NoteNode({ id, data, selected }: NodeProps) {
  const d = data as NoteData;
  const { updateNodeData } = useReactFlow();
  return (
    <div className={cn("relative h-full min-h-[120px] w-full min-w-[200px] rounded-2xl border bg-[#f5c542]/12 p-3", selected ? "border-[#f5c542]/70" : "border-[#f5c542]/25")}>
      <NodeResizer isVisible={!!selected} minWidth={200} minHeight={120} lineClassName="!border-[#f5c542]/50" handleClassName="!bg-[#f5c542]" />
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-[#f5c542]">
        <StickyNote className="size-3.5" /> 메모
      </div>
      <textarea
        value={d.text ?? ""}
        onChange={(e) => updateNodeData(id, { text: e.target.value })}
        placeholder="기획 메모, 레퍼런스 설명…"
        className="nodrag nowheel size-full min-h-[80px] resize-none bg-transparent text-[12.5px] leading-relaxed text-fg-2 outline-none placeholder:text-fg-4"
      />
    </div>
  );
}

/* ------------------------------- 파일 입력 -------------------------------- */

function AssetInputNode({ id, data, selected, kind }: NodeProps & { kind: "image" | "video" }) {
  const d = data as AssetInputData;
  const { pickAsset, openAsset, canEdit } = useCanvas();
  const { updateNodeData } = useReactFlow();
  return (
    <Shell
      selected={selected}
      icon={kind === "image" ? <ImageIcon /> : <Video />}
      title={kind === "image" ? "이미지" : "영상"}
      className="w-[240px]"
      accent={TINT[kind]}
      right={
        d.asset && canEdit ? (
          <button onClick={() => updateNodeData(id, { asset: undefined })} className="rounded p-0.5 text-fg-4 hover:text-fg" aria-label="비우기">
            <X className="size-3.5" />
          </button>
        ) : null
      }
    >
      <div className="p-2">
        {d.asset ? (
          <button className="nodrag block w-full overflow-hidden rounded-xl" onClick={() => openAsset(d.asset!)} style={{ aspectRatio: d.asset.width && d.asset.height ? `${d.asset.width}/${d.asset.height}` : "1" }}>
            <MediaThumb kind={d.asset.kind} thumb={d.asset.urls.thumb} src={d.asset.urls.src} durationSec={d.asset.durationSec} />
          </button>
        ) : (
          <button
            disabled={!canEdit}
            onClick={() => pickAsset(id, kind)}
            className="nodrag flex aspect-video w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-line-3 text-fg-4 transition hover:border-fg-3 hover:text-fg-2"
          >
            <FolderOpen className="size-5" />
            <span className="text-[11px]">라이브러리에서 선택·업로드</span>
          </button>
        )}
      </div>
      <Port type="source" id={kind} port={kind} top="50%" label={kind === "image" ? "이미지" : "영상"} />
    </Shell>
  );
}

export function ImageInputNode(props: NodeProps) {
  return <AssetInputNode {...props} kind="image" />;
}
export function VideoInputNode(props: NodeProps) {
  return <AssetInputNode {...props} kind="video" />;
}

/* --------------------------------- 생성 노드 -------------------------------- */

function GenNode({ id, data, selected, kind }: NodeProps & { kind: "image" | "video" }) {
  const d = data as GenData;
  const { runNode, canEdit, status, openAsset, fanOut, nodeLabel, resultCount, openResults } = useCanvas();
  const results = resultCount(id);
  const times = fanOut(id);
  const { updateNodeData } = useReactFlow();
  const models = kind === "image" ? IMAGE_MODELS : VIDEO_MODELS;
  const model = models.find((m) => m.id === d.modelId) ?? models[0];
  const params = sanitizeParams(model, { ...defaultParams(model), ...(d.params ?? {}) });
  const count = Math.min(model.count.max, d.count ?? 1);
  const running = d.status && ["pending", "queued", "in_progress", "finalizing"].includes(d.status);
  const perReq = model.count.native ? [count] : Array.from({ length: count }, () => 1);
  const est = perReq.reduce(
    (s, n) =>
      s +
      model.estimate(
        { params, count: n, refImages: 0, hasStartFrame: false, refVideos: 0, inputVideoSeconds: 0, now: new Date() },
        status[model.id]?.priceOverrides ?? {},
      ),
    0,
  );
  const output = chosenOutput(d);

  const inputs =
    kind === "image"
      ? [
          { id: "prompt", port: "text" as const, label: "프롬프트" },
          { id: "refs", port: "image" as const, label: "레퍼런스" },
        ]
      : [
          { id: "prompt", port: "text" as const, label: "프롬프트" },
          { id: "start", port: "image" as const, label: "시작" },
          { id: "end", port: "image" as const, label: "끝" },
          { id: "refs", port: "image" as const, label: "레퍼런스" },
          { id: "videoIn", port: "video" as const, label: "영상" },
        ];

  return (
    <Shell
      selected={selected}
      icon={kind === "image" ? <ImagePlus /> : <Clapperboard />}
      title={nodeLabel(id)}
      accent={TINT[kind]}
      className="w-[340px]"
      running={!!running}
      right={
        <span className="flex items-center gap-1.5 font-mono text-[10.5px] text-fg-3">
          {times > 1 && <span className="rounded-full bg-accent/15 px-1.5 text-accent">×{times}</span>}
          {usd(Math.round(est * times * 1_000_000))}
        </span>
      }
    >
      {inputs.map((inp, i) => {
        const top = 58 + i * 22;
        return (
          <React.Fragment key={inp.id}>
            <Port type="target" id={inp.id} port={inp.port} top={top} label={inp.label} />
            <PortLabel side="left" top={top}>
              {inp.label}
            </PortLabel>
          </React.Fragment>
        );
      })}
      <div className="flex flex-col gap-3 p-3" style={{ paddingTop: 12 + inputs.length * 22 }}>
        <div className="nodrag flex items-center gap-2">
          <ModelSwatch model={model} className="size-7" />
          <Select
            size="sm"
            value={model.id}
            disabled={!canEdit}
            onValueChange={(v) => updateNodeData(id, { modelId: v, params: {} })}
            options={models.map((m) => ({ value: m.id, label: m.name, hint: status[m.id]?.provider === "mock" ? "MOCK" : undefined }))}
            className="flex-1"
          />
        </div>
        <textarea
          value={d.text ?? ""}
          onChange={(e) => updateNodeData(id, { text: e.target.value })}
          readOnly={!canEdit}
          rows={2}
          placeholder="추가 지시 (연결된 프롬프트 뒤에 붙어요)"
          className="nodrag nowheel w-full resize-none rounded-xl border border-line bg-panel-2/60 px-2.5 py-2 text-[12px] outline-none placeholder:text-fg-4 focus:border-line-3"
        />
        <div className="nodrag nowheel max-h-[260px] overflow-y-auto pr-1 scrollbar-thin">
          <ParamControls model={model} params={params} compact onChange={(next) => updateNodeData(id, { params: next })} />
        </div>
        <div className="nodrag flex items-center gap-2">
          <span className="text-[11.5px] text-fg-3">개수</span>
          <div className="flex gap-1">
            {Array.from({ length: model.count.max }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                disabled={!canEdit}
                onClick={() => updateNodeData(id, { count: n })}
                className={cn("size-6 rounded-md font-mono text-[11px] transition", n === count ? "bg-inv text-inv-fg" : "bg-panel-3 text-fg-3 hover:text-fg")}
              >
                {n}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={!canEdit || running}
            onClick={() => runNode(id)}
            className="ml-auto flex h-8 items-center gap-1.5 rounded-lg bg-inv px-3 text-[12px] font-semibold text-inv-fg transition hover:opacity-90 disabled:opacity-40"
          >
            {running ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5 fill-current" />}
            {running ? GENERATION_STATUS_LABEL[d.status!] : times > 1 ? `${times}번 실행` : "실행"}
          </button>
        </div>

        {(running || d.outputs?.length || d.error) && (
          <div className="flex flex-col gap-2 border-t border-line pt-3">
            {d.error && !running && (
              <p className="flex items-start gap-1.5 text-[11.5px] text-danger">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {d.error}
              </p>
            )}
            {running && !d.outputs?.length && <div className="generating aspect-video rounded-xl" />}
            {output && (
              <button className="nodrag block overflow-hidden rounded-xl border border-line" onClick={() => openAsset(output)} style={{ aspectRatio: output.width && output.height ? `${output.width}/${output.height}` : "1" }}>
                <MediaThumb kind={output.kind} thumb={output.urls.thumb} src={output.urls.src} durationSec={output.durationSec} />
              </button>
            )}
            {(d.outputs?.length ?? 0) > 1 && (
              <div className="nodrag flex gap-1.5 overflow-x-auto scrollbar-none">
                {d.outputs!.map((o, i) => {
                  const on = o.id === output?.id;
                  return (
                    <Tip key={o.id} content={on ? "다음 노드로 넘어가는 결과" : "이 결과를 다음 노드로"}>
                      <button
                        onClick={() => updateNodeData(id, { selected: i, pickId: o.id })}
                        className={cn("relative size-12 shrink-0 overflow-hidden rounded-lg border-2 transition", on ? "border-accent" : "border-transparent opacity-60 hover:opacity-100")}
                      >
                        <MediaThumb kind={o.kind} thumb={o.urls.thumb} src={o.urls.src} autoPlayOnHover={false} />
                        {on && (
                          <span className="absolute right-0.5 top-0.5 flex size-3.5 items-center justify-center rounded-full bg-accent text-on-accent">
                            <Check className="size-2.5" />
                          </span>
                        )}
                      </button>
                    </Tip>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {results > 0 && (
          <button
            type="button"
            onClick={() => openResults(id)}
            className="nodrag -mb-1 flex items-center justify-between rounded-lg border border-line px-2.5 py-1.5 text-[11.5px] text-fg-3 transition hover:border-line-3 hover:text-fg"
          >
            <span>
              지금까지 결과 <span className="font-mono tabular-nums text-fg">{results}</span>개
            </span>
            <span className="flex items-center gap-0.5">
              결과 모음 <ArrowUpRight className="size-3.5" />
            </span>
          </button>
        )}
      </div>
      <Port type="source" id={kind} port={kind} top="50%" label={kind === "image" ? "이미지" : "영상"} />
    </Shell>
  );
}

export function ImageGenNode(props: NodeProps) {
  return <GenNode {...props} kind="image" />;
}
export function VideoGenNode(props: NodeProps) {
  return <GenNode {...props} kind="video" />;
}

export const NODE_TYPES = {
  prompt: PromptNode,
  list: ListNode,
  note: NoteNode,
  imageInput: ImageInputNode,
  videoInput: VideoInputNode,
  imageGen: ImageGenNode,
  videoGen: VideoGenNode,
};
