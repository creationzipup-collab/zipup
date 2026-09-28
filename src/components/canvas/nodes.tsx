"use client";

import { Handle, NodeResizer, Position, useReactFlow, type NodeProps } from "@xyflow/react";
import {
  AlertTriangle,
  Check,
  Clapperboard,
  FolderOpen,
  ImageIcon,
  ImagePlus,
  Loader2,
  Play,
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

import { PORT_COLOR, useCanvas, type AssetInputData, type GenData, type NoteData, type PortType, type PromptData } from "./canvas-context";

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
}: {
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
        "relative flex flex-col rounded-2xl border bg-panel/95 shadow-[var(--shadow-soft)] backdrop-blur-xl transition-[border,box-shadow]",
        selected ? "border-fg/50 shadow-[0_0_0_4px_var(--line)]" : "border-line-2",
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
      accent={kind === "image" ? "rgb(255 91 36 / 0.2)" : "rgb(76 141 255 / 0.2)"}
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
  const { runNode, canEdit, status, openAsset } = useCanvas();
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
  const selectedIdx = d.selected ?? 0;
  const output = d.outputs?.[selectedIdx];

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
      title={kind === "image" ? "이미지 생성" : "영상 생성"}
      accent={kind === "image" ? "rgb(255 91 36 / 0.22)" : "rgb(76 141 255 / 0.22)"}
      className="w-[340px]"
      right={<span className="font-mono text-[10.5px] text-fg-3">{usd(Math.round(est * 1_000_000))}</span>}
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
            {running ? GENERATION_STATUS_LABEL[d.status!] : "실행"}
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
                {d.outputs!.map((o, i) => (
                  <Tip key={o.id} content={i === selectedIdx ? "다음 노드로 전달되는 컷" : "이 컷을 다음 노드로"}>
                    <button
                      onClick={() => updateNodeData(id, { selected: i })}
                      className={cn("relative size-12 shrink-0 overflow-hidden rounded-lg border-2", i === selectedIdx ? "border-fg" : "border-transparent opacity-70 hover:opacity-100")}
                    >
                      <MediaThumb kind={o.kind} thumb={o.urls.thumb} src={o.urls.src} autoPlayOnHover={false} />
                      {i === selectedIdx && (
                        <span className="absolute right-0.5 top-0.5 flex size-3.5 items-center justify-center rounded-full bg-inv text-inv-fg">
                          <Check className="size-2.5" />
                        </span>
                      )}
                    </button>
                  </Tip>
                ))}
              </div>
            )}
          </div>
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
  note: NoteNode,
  imageInput: ImageInputNode,
  videoInput: VideoInputNode,
  imageGen: ImageGenNode,
  videoGen: VideoGenNode,
};
