"use client";

import "@xyflow/react/dist/style.css";

import {
  addEdge,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  Clapperboard,
  CloudOff,
  ImageIcon,
  ImagePlus,
  Loader2,
  Play,
  StickyNote,
  Trash2,
  Type,
  Video,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { AssetPicker } from "@/components/assets/asset-picker";
import { Lightbox, type LightboxItem } from "@/components/assets/lightbox";
import type { ModelStatus } from "@/components/studio/model-picker";
import type { RefAsset } from "@/components/studio/reference-slots";
import { Button } from "@/components/ui/button";
import { Tip } from "@/components/ui/menu";
import { Kbd } from "@/components/ui/misc";
import { createGenerationRequest, useActiveGenerations, usePushGenerations, type GenerationDTO } from "@/lib/client/generations";
import { defaultParams, getModel, sanitizeParams } from "@/lib/models/registry";
import { TERMINAL_STATUSES } from "@/lib/types";
import { cn, fetchJson, usd } from "@/lib/utils";

import { CanvasContext, portType, type AssetInputData, type GenData, type PromptData } from "./canvas-context";
import { NODE_TYPES } from "./nodes";

type Graph = { nodes: Node[]; edges: Edge[]; viewport?: { x: number; y: number; zoom: number } };

const PALETTE = [
  { type: "prompt", label: "프롬프트", icon: Type, data: { text: "" } },
  { type: "imageInput", label: "이미지", icon: ImageIcon, data: {} },
  { type: "videoInput", label: "영상", icon: Video, data: {} },
  { type: "imageGen", label: "이미지 생성", icon: ImagePlus, data: { modelId: "seedream-5-pro", params: {}, count: 1 } },
  { type: "videoGen", label: "영상 생성", icon: Clapperboard, data: { modelId: "seedance-2-5", params: { draft: true }, count: 1 } },
  { type: "note", label: "메모", icon: StickyNote, data: { text: "" }, style: { width: 260, height: 160 } },
] as const;

function toRef(o: GenerationDTO["outputs"][number]): RefAsset {
  return { id: o.id, kind: o.kind, filename: o.filename, width: o.width, height: o.height, durationSec: o.durationSec, urls: o.urls };
}

export function CanvasEditor(props: {
  canvas: { id: string; name: string; projectId: string; projectName: string; graph: Graph };
  canEdit: boolean;
  status: Record<string, ModelStatus>;
}) {
  return (
    <ReactFlowProvider>
      <Editor {...props} />
    </ReactFlowProvider>
  );
}

function Editor({
  canvas,
  canEdit,
  status,
}: {
  canvas: { id: string; name: string; projectId: string; projectName: string; graph: Graph };
  canEdit: boolean;
  status: Record<string, ModelStatus>;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const push = usePushGenerations();
  const rf = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(canvas.graph.nodes ?? []);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(canvas.graph.edges ?? []);
  const [name, setName] = React.useState(canvas.name);
  const [saveState, setSaveState] = React.useState<"saved" | "saving" | "error">("saved");
  const [picker, setPicker] = React.useState<{ nodeId: string; kind: "image" | "video" } | null>(null);
  const [lightbox, setLightbox] = React.useState<LightboxItem | null>(null);
  const [runningAll, setRunningAll] = React.useState(false);
  const nodesRef = React.useRef(nodes);
  nodesRef.current = nodes;
  const edgesRef = React.useRef(edges);
  edgesRef.current = edges;

  /* ------------------------------- 자동 저장 ------------------------------- */
  const first = React.useRef(true);
  React.useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!canEdit) return;
    setSaveState("saving");
    const t = setTimeout(async () => {
      try {
        const clean = nodesRef.current.map((n) => ({ id: n.id, type: n.type, position: n.position, data: n.data, style: n.style, width: n.width, height: n.height }));
        await fetchJson(`/api/canvases/${canvas.id}`, {
          method: "PATCH",
          body: JSON.stringify({ graph: { nodes: clean, edges: edgesRef.current.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle, targetHandle: e.targetHandle })), viewport: rf.getViewport() } }),
        });
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    }, 900);
    return () => clearTimeout(t);
  }, [nodes, edges, canEdit, canvas.id, rf]);

  async function rename(next: string) {
    if (!next.trim() || next === canvas.name) return;
    await fetchJson(`/api/canvases/${canvas.id}`, { method: "PATCH", body: JSON.stringify({ name: next.trim() }) }).catch(() => {});
  }

  /* ------------------------------ 생성 결과 반영 ------------------------------ */
  const { data: active = [] } = useActiveGenerations();
  const applyGenerations = React.useCallback(
    (gens: GenerationDTO[]) => {
      setNodes((ns) =>
        ns.map((n) => {
          const d = n.data as GenData;
          if (!d.runs?.length) return n;
          const mine = gens.filter((g) => d.runs!.includes(g.id));
          if (!mine.length) return n;
          const statuses = mine.map((g) => g.status);
          const allDone = statuses.every((s) => TERMINAL_STATUSES.includes(s));
          const outputs = mine.flatMap((g) => g.outputs.map(toRef));
          const failed = mine.find((g) => g.status === "failed" || g.status === "nsfw");
          const status = allDone ? (outputs.length ? "completed" : failed?.status ?? "failed") : mine.find((g) => !TERMINAL_STATUSES.includes(g.status))!.status;
          const next: GenData = {
            ...d,
            status,
            outputs: outputs.length ? outputs : d.outputs,
            error: allDone && !outputs.length ? failed?.errorMessage ?? "생성에 실패했어요." : null,
          };
          if (JSON.stringify(next) === JSON.stringify(d)) return n;
          return { ...n, data: next };
        }),
      );
    },
    [setNodes],
  );
  React.useEffect(() => {
    const mine = active.filter((g) => g.canvasNodeId);
    if (mine.length) applyGenerations(mine);
  }, [active, applyGenerations]);

  // 처음 열 때 이 캔버스의 최근 실행 상태 동기화
  React.useEffect(() => {
    fetchJson<{ items: GenerationDTO[] }>(`/api/generations?canvasId=${canvas.id}&limit=60`)
      .then((r) => applyGenerations(r.items))
      .catch(() => {});
  }, [canvas.id, applyGenerations]);

  /* ---------------------------------- 실행 ---------------------------------- */
  const gather = React.useCallback((nodeId: string) => {
    const ns = nodesRef.current;
    const incoming = edgesRef.current.filter((e) => e.target === nodeId);
    const prompts: string[] = [];
    const images: string[] = [];
    const videos: string[] = [];
    let start: string | undefined;
    let end: string | undefined;
    let missing: string | null = null;
    for (const e of incoming) {
      const src = ns.find((n) => n.id === e.source);
      if (!src) continue;
      let text: string | undefined;
      let asset: RefAsset | undefined;
      if (src.type === "prompt") text = (src.data as PromptData).text;
      else if (src.type === "imageInput" || src.type === "videoInput") asset = (src.data as AssetInputData).asset;
      else if (src.type === "imageGen" || src.type === "videoGen") {
        const d = src.data as GenData;
        asset = d.outputs?.[d.selected ?? 0];
        if (!asset) missing = "앞 단계 노드를 먼저 실행해 주세요.";
      }
      switch (e.targetHandle) {
        case "prompt":
          if (text?.trim()) prompts.push(text.trim());
          break;
        case "refs":
          if (asset?.kind === "image") images.push(asset.id);
          break;
        case "start":
          if (asset?.kind === "image") start = asset.id;
          break;
        case "end":
          if (asset?.kind === "image") end = asset.id;
          break;
        case "videoIn":
          if (asset?.kind === "video") videos.push(asset.id);
          break;
      }
    }
    return { prompts, images, videos, start, end, missing };
  }, []);

  const runNode = React.useCallback(
    async (nodeId: string) => {
      const node = nodesRef.current.find((n) => n.id === nodeId);
      if (!node || (node.type !== "imageGen" && node.type !== "videoGen")) return;
      const d = node.data as GenData;
      const model = getModel(d.modelId);
      if (!model) return;
      const g = gather(nodeId);
      if (g.missing) {
        toast.error(g.missing);
        return;
      }
      const prompt = [...g.prompts, d.text?.trim()].filter(Boolean).join("\n");
      const params = sanitizeParams(model, { ...defaultParams(model), ...(d.params ?? {}) });
      rf.updateNodeData(nodeId, { status: "pending", error: null });
      try {
        const res = await createGenerationRequest({
          modelId: model.id,
          prompt,
          params,
          inputs: { images: g.images, videos: g.videos, startFrame: g.start, endFrame: g.end },
          count: d.count ?? 1,
          projectId: canvas.projectId,
          canvasId: canvas.id,
          canvasNodeId: nodeId,
        });
        rf.updateNodeData(nodeId, { runs: res.generations.map((x) => x.id), status: "pending", selected: 0 });
        push(res.generations);
      } catch (e) {
        rf.updateNodeData(nodeId, { status: "failed", error: (e as Error).message });
        toast.error((e as Error).message);
      }
    },
    [gather, rf, canvas.projectId, canvas.id, push],
  );

  /** 위상 정렬 순서로 생성 노드 전체 실행 (앞 단계 완료를 기다림) */
  async function runAll() {
    const gens = nodesRef.current.filter((n) => n.type === "imageGen" || n.type === "videoGen");
    if (!gens.length) return toast("실행할 생성 노드가 없어요.");
    setRunningAll(true);
    try {
      const done = new Set<string>();
      const deps = (id: string) =>
        edgesRef.current
          .filter((e) => e.target === id)
          .map((e) => nodesRef.current.find((n) => n.id === e.source))
          .filter((n): n is Node => !!n && (n.type === "imageGen" || n.type === "videoGen"))
          .map((n) => n.id);
      let guard = 0;
      while (done.size < gens.length && guard++ < 200) {
        const ready = gens.filter((n) => !done.has(n.id) && deps(n.id).every((dep) => done.has(dep)));
        if (!ready.length) break;
        for (const n of ready) await runNode(n.id);
        // 이번 단계 완료 대기
        const deadline = Date.now() + 15 * 60_000;
        while (Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 2000));
          const st = ready.map((n) => (nodesRef.current.find((x) => x.id === n.id)?.data as GenData | undefined)?.status);
          if (st.every((s) => s && TERMINAL_STATUSES.includes(s))) break;
        }
        for (const n of ready) {
          const d = nodesRef.current.find((x) => x.id === n.id)?.data as GenData | undefined;
          if (d?.status !== "completed") throw new Error("앞 단계가 실패해서 전체 실행을 멈췄어요.");
          done.add(n.id);
        }
      }
      toast.success("전체 실행을 마쳤어요.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRunningAll(false);
      void qc.invalidateQueries({ queryKey: ["assets"] });
    }
  }

  /* --------------------------------- 편집 --------------------------------- */
  const onConnect = React.useCallback(
    (c: Connection) => {
      const s = nodesRef.current.find((n) => n.id === c.source);
      const t = nodesRef.current.find((n) => n.id === c.target);
      const a = portType(s?.type, c.sourceHandle);
      const b = portType(t?.type, c.targetHandle);
      if (!a || a !== b) {
        toast.error("같은 종류끼리만 연결할 수 있어요. (텍스트↔텍스트, 이미지↔이미지, 영상↔영상)");
        return;
      }
      setEdges((es) => {
        // 시작/끝 프레임은 하나만
        const filtered = c.targetHandle === "start" || c.targetHandle === "end" ? es.filter((e) => !(e.target === c.target && e.targetHandle === c.targetHandle)) : es;
        return addEdge({ ...c, animated: false, style: { stroke: a === "image" ? "#ff5b24" : a === "video" ? "#4c8dff" : "var(--line-3)", strokeWidth: 1.6 } }, filtered);
      });
    },
    [setEdges],
  );

  function addNode(type: string, position?: { x: number; y: number }) {
    const def = PALETTE.find((p) => p.type === type)!;
    const center = position ?? rf.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    const id = `${type}-${Math.random().toString(36).slice(2, 8)}`;
    setNodes((ns) => [
      ...ns.map((n) => ({ ...n, selected: false })),
      { id, type, position: { x: center.x - 150, y: center.y - 80 }, data: structuredClone(def.data) as Record<string, unknown>, selected: true, ...("style" in def ? { style: def.style } : {}) },
    ]);
  }

  const totalEstimate = nodes.reduce((sum, n) => {
    if (n.type !== "imageGen" && n.type !== "videoGen") return sum;
    const d = n.data as GenData;
    const m = getModel(d.modelId);
    if (!m) return sum;
    const params = sanitizeParams(m, { ...defaultParams(m), ...(d.params ?? {}) });
    const count = Math.min(m.count.max, d.count ?? 1);
    const per = m.count.native ? [count] : Array.from({ length: count }, () => 1);
    return sum + per.reduce((s, c) => s + m.estimate({ params, count: c, refImages: 0, hasStartFrame: false, refVideos: 0, inputVideoSeconds: 0, now: new Date() }, status[m.id]?.priceOverrides ?? {}), 0);
  }, 0);

  const ctx = React.useMemo(
    () => ({
      canvasId: canvas.id,
      projectId: canvas.projectId,
      canEdit,
      status,
      runNode,
      pickAsset: (nodeId: string, kind: "image" | "video") => setPicker({ nodeId, kind }),
      openAsset: (a: RefAsset) => setLightbox({ id: a.id, kind: a.kind, urls: a.urls, width: a.width, height: a.height, durationSec: a.durationSec, filename: a.filename }),
    }),
    [canvas.id, canvas.projectId, canEdit, status, runNode],
  );

  return (
    <CanvasContext.Provider value={ctx}>
      <div className="relative h-[calc(100dvh-56px)] w-full" data-hotkeys-scope>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={canEdit ? onNodesChange : undefined}
          onEdgesChange={canEdit ? onEdgesChange : undefined}
          onConnect={canEdit ? onConnect : undefined}
          nodeTypes={NODE_TYPES}
          defaultViewport={canvas.graph.viewport}
          fitView={!canvas.graph.viewport}
          fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
          minZoom={0.2}
          maxZoom={1.8}
          proOptions={{ hideAttribution: true }}
          deleteKeyCode={canEdit ? ["Backspace", "Delete"] : null}
          nodesDraggable={canEdit}
          nodesConnectable={canEdit}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
          }}
          onDrop={(e) => {
            e.preventDefault();
            const type = e.dataTransfer.getData("application/x-zipup-node");
            const asset = e.dataTransfer.getData("application/x-zipup-asset");
            const pos = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
            if (type) addNode(type, { x: pos.x + 150, y: pos.y + 80 });
            else if (asset) {
              const a = JSON.parse(asset) as RefAsset;
              const id = `${a.kind}Input-${Math.random().toString(36).slice(2, 8)}`;
              setNodes((ns) => [...ns, { id, type: a.kind === "image" ? "imageInput" : "videoInput", position: pos, data: { asset: a } }]);
            }
          }}
          className="bg-bg"
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} color="var(--grid-dot)" />
          <Controls position="bottom-right" showInteractive={false} className="!rounded-xl !border !border-line-2 !shadow-none [&_button]:!border-line" />
          <MiniMap position="bottom-left" pannable zoomable className="!rounded-xl !border !border-line-2" maskColor="rgb(0 0 0 / 0.5)" nodeColor={(n) => (n.type === "imageGen" ? "#ff5b24" : n.type === "videoGen" ? "#4c8dff" : n.type === "note" ? "#f5c542" : "#666")} />

          {/* 상단 바 */}
          <Panel position="top-left" className="!m-3">
            <div className="glass flex items-center gap-2 rounded-2xl p-1.5 pr-3 shadow-[var(--shadow-soft)]">
              <Button variant="ghost" size="icon-sm" onClick={() => router.push(`/projects/${canvas.projectId}?tab=canvases`)} aria-label="뒤로">
                <ArrowLeft />
              </Button>
              <div className="flex flex-col">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={() => rename(name)}
                  onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
                  readOnly={!canEdit}
                  className="w-48 bg-transparent text-[13.5px] font-semibold outline-none"
                />
                <Link href={`/projects/${canvas.projectId}`} className="text-[11px] text-fg-4 hover:text-fg-2">
                  {canvas.projectName}
                </Link>
              </div>
              <span className="ml-2 flex items-center gap-1 text-[11px] text-fg-4">
                {saveState === "saving" ? (
                  <><Loader2 className="size-3 animate-spin" /> 저장 중</>
                ) : saveState === "error" ? (
                  <><CloudOff className="size-3 text-danger" /> 저장 실패</>
                ) : (
                  <><Check className="size-3" /> 저장됨</>
                )}
              </span>
            </div>
          </Panel>

          <Panel position="top-right" className="!m-3">
            <div className="glass flex items-center gap-2 rounded-2xl p-1.5 shadow-[var(--shadow-soft)]">
              <span className="px-2 font-mono text-[12px] text-fg-3">전체 예상 {usd(Math.round(totalEstimate * 1_000_000))}</span>
              <Button variant="primary" size="sm" disabled={!canEdit || runningAll} loading={runningAll} onClick={runAll} className="glow-ring">
                {!runningAll && <Play className="fill-current" />} 전체 실행
              </Button>
            </div>
          </Panel>

          {/* 노드 팔레트 */}
          {canEdit && (
            <Panel position="center-left" className="!m-3">
              <div className="glass flex flex-col gap-1 rounded-2xl p-1.5 shadow-[var(--shadow-soft)]">
                {PALETTE.map((p) => {
                  const Icon = p.icon;
                  return (
                    <Tip key={p.type} content={`${p.label} 노드 (클릭 또는 드래그)`} side="right">
                      <button
                        type="button"
                        draggable
                        onDragStart={(e) => e.dataTransfer.setData("application/x-zipup-node", p.type)}
                        onClick={() => addNode(p.type)}
                        className={cn(
                          "flex size-10 items-center justify-center rounded-xl text-fg-2 transition hover:bg-panel-3 hover:text-fg",
                          p.type === "imageGen" && "text-accent",
                          p.type === "videoGen" && "text-info",
                        )}
                      >
                        <Icon className="size-[18px]" />
                      </button>
                    </Tip>
                  );
                })}
                <span className="mx-2 my-1 h-px bg-line" />
                <Tip content="선택한 노드 삭제" side="right" shortcut="⌫">
                  <button
                    type="button"
                    onClick={() => {
                      setNodes((ns) => ns.filter((n) => !n.selected));
                      setEdges((es) => es.filter((e) => !e.selected));
                    }}
                    className="flex size-10 items-center justify-center rounded-xl text-fg-3 transition hover:bg-danger/10 hover:text-danger"
                  >
                    <Trash2 className="size-[18px]" />
                  </button>
                </Tip>
              </div>
            </Panel>
          )}

          {nodes.length === 0 && (
            <Panel position="top-center" className="!mt-28">
              <div className="flex flex-col items-center gap-2 text-center">
                <p className="text-[15px] font-semibold">빈 캔버스예요</p>
                <p className="text-sm text-fg-3">왼쪽 팔레트에서 노드를 추가하고 포트를 끌어 연결하세요.</p>
              </div>
            </Panel>
          )}

          <Panel position="bottom-center" className="!mb-4 hidden lg:block">
            <p className="flex items-center gap-2 rounded-full border border-line bg-panel/80 px-3 py-1.5 text-[11px] text-fg-4 backdrop-blur">
              <span className="size-2 rounded-full" style={{ background: "#f4f4f5" }} /> 텍스트
              <span className="size-2 rounded-full bg-accent" /> 이미지
              <span className="size-2 rounded-full bg-info" /> 영상 · 같은 색 포트끼리 연결 · 라이브러리 이미지를 끌어다 놓아도 돼요 · <Kbd>⌫</Kbd> 삭제
            </p>
          </Panel>
        </ReactFlow>
      </div>

      <AssetPicker
        open={!!picker}
        onOpenChange={(o) => !o && setPicker(null)}
        kind={picker?.kind}
        projectId={canvas.projectId}
        onPick={(items) => picker && rf.updateNodeData(picker.nodeId, { asset: items[0] })}
      />
      {lightbox && <Lightbox items={[lightbox]} index={0} onIndexChange={() => {}} onClose={() => setLightbox(null)} />}
    </CanvasContext.Provider>
  );
}
