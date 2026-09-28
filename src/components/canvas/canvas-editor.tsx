"use client";

import "@xyflow/react/dist/style.css";

import {
  addEdge,
  Background,
  BackgroundVariant,
  type Connection,
  type Edge,
  type FinalConnectionState,
  MiniMap,
  type Node,
  type NodeChange,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  useViewport,
  ViewportPortal,
} from "@xyflow/react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  CloudOff,
  Keyboard,
  LayoutList,
  Loader2,
  Map as MapIcon,
  Maximize,
  Minus,
  Play,
  Plus,
  Redo2,
  Settings2,
  Trash2,
  Undo2,
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
import { useConfirm } from "@/components/ui/confirm";
import { Switch } from "@/components/ui/controls";
import { Popover, PopoverContent, PopoverTrigger, Tip } from "@/components/ui/menu";
import { Kbd } from "@/components/ui/misc";
import { useAssetMutations } from "@/lib/client/assets";
import { createGenerationRequest, useActiveGenerations, usePushGenerations, type GenerationDTO } from "@/lib/client/generations";
import { useIsClient } from "@/lib/client/use-is-client";
import { defaultParams, getModel, sanitizeParams } from "@/lib/models/registry";
import { ACTIVE_STATUSES, type Flag, TERMINAL_STATUSES } from "@/lib/types";
import { cn, fetchJson, randomId, usd } from "@/lib/utils";

import { CanvasContext, canConnect, chosenOutput, portType, type AssetInputData, type GenData, type ListData, type PromptData } from "./canvas-context";
import { NODE_DEF, NODE_DEFS, type NodeKind } from "./catalog";
import { cloneGraph, copyToClipboard, type Guides, mergeRuntime, readClipboard, snapToGuides, type Snapshot, useCanvasHistory } from "./helpers";
import { NODE_TYPES } from "./nodes";
import { PeerStack, RemoteCursors, usePresence } from "./presence";
import { QuickAdd, type QuickAddChoice, type QuickAddFrom } from "./quick-add";
import { type CanvasResult, groupRuns } from "./results-list";
import { type LaserStroke, SKETCH_COLORS, SketchCapture, type SketchMode, SketchStrokes, SketchToolbar, type Stroke } from "./sketch";

type Graph = { nodes: Node[]; edges: Edge[]; viewport?: { x: number; y: number; zoom: number }; sketch?: Stroke[] };

const PORT_STROKE = { text: "rgb(223 232 242 / 0.42)", image: "#1ea7ff", video: "#a48bff", media: "#6cc8ff" } as const;
const NODE_WIDTH: Partial<Record<NodeKind, number>> = { prompt: 300, list: 290, imageInput: 240, videoInput: 240, imageGen: 340, videoGen: 340, results: 400, note: 260 };
/** 반복 입력으로 한 번에 돌릴 수 있는 최대 조합 수 */
const MAX_FAN_OUT = 24;

type Prefs = { wheel: "pan" | "zoom"; snap: boolean; minimap: boolean };
const DEFAULT_PREFS: Prefs = { wheel: "pan", snap: false, minimap: true };
const PREFS_KEY = "zipup-canvas-prefs";

function loadPrefs(): Prefs {
  try {
    return { ...DEFAULT_PREFS, ...(JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") as Partial<Prefs>) };
  } catch {
    return DEFAULT_PREFS;
  }
}

function toRef(o: GenerationDTO["outputs"][number]): RefAsset {
  return { id: o.id, kind: o.kind, filename: o.filename, width: o.width, height: o.height, durationSec: o.durationSec, urls: o.urls };
}

const edgeStyle = (port: keyof typeof PORT_STROKE) => ({ stroke: PORT_STROKE[port], strokeWidth: 1.6 });
/** 선 색: 받는 쪽 종류로, 결과 리스트로 들어가는 선은 보내는 쪽 종류로 */
const edgePort = (e: Pick<Edge, "sourceHandle" | "targetHandle">): keyof typeof PORT_STROKE => {
  const t = portType(undefined, e.targetHandle);
  const s = portType(undefined, e.sourceHandle);
  if (t && t !== "media") return t;
  if (s && s !== "media") return s;
  return "media";
};

const TYPE_LABEL: Record<string, string> = { prompt: "프롬프트", list: "반복 입력", imageInput: "이미지", videoInput: "영상", imageGen: "이미지 생성", videoGen: "영상 생성", results: "결과 리스트", note: "메모" };
/** 결과 리스트용으로 한 번에 불러오는 실행 수 */
const RESULTS_PAGE = 120;

export function CanvasEditor(props: {
  canvas: { id: string; name: string; projectId: string; projectName: string; graph: Graph };
  canEdit: boolean;
  status: Record<string, ModelStatus>;
  me: { id: string; name: string };
}) {
  // 캔버스는 브라우저에서만 그려요. 서버에서 그린 뒤 이어받으면 노드 크기를 처음 잴 때 다시 그리기가 꼬일 수 있어요.
  const client = useIsClient();
  if (!client) return <div className="canvas-surface h-[calc(100dvh-56px)] w-full bg-bg" aria-busy />;
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
  me,
}: {
  canvas: { id: string; name: string; projectId: string; projectName: string; graph: Graph };
  canEdit: boolean;
  status: Record<string, ModelStatus>;
  me: { id: string; name: string };
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const push = usePushGenerations();
  const rf = useReactFlow();
  const [confirm, confirmDialog] = useConfirm();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(canvas.graph.nodes ?? []);
  // 저장된 선 색은 예전 색일 수 있어서, 불러올 때 연결된 포트 종류로 한 번 다시 칠해요
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>((canvas.graph.edges ?? []).map((e) => ({ ...e, style: { ...e.style, ...edgeStyle(edgePort(e)) } })));
  const [sketch, setSketch] = React.useState<Stroke[]>(canvas.graph.sketch ?? []);
  const [liveStroke, setLiveStroke] = React.useState<Stroke | null>(null);
  const [remoteLive, setRemoteLive] = React.useState<Record<string, Stroke>>({});
  const [lasers, setLasers] = React.useState<LaserStroke[]>([]);
  const [mode, setMode] = React.useState<SketchMode>("select");
  const [penColor, setPenColor] = React.useState(SKETCH_COLORS[0]);
  const [name, setName] = React.useState(canvas.name);
  const [saveState, setSaveState] = React.useState<"saved" | "saving" | "error">("saved");
  const [picker, setPicker] = React.useState<{ nodeId: string; kind: "image" | "video"; multiple?: boolean } | null>(null);
  const [lightbox, setLightbox] = React.useState<{ items: LightboxItem[]; index: number } | null>(null);
  const [runningAll, setRunningAll] = React.useState(false);
  const [quick, setQuick] = React.useState<{ at: { x: number; y: number }; flow: { x: number; y: number }; from: QuickAddFrom | null } | null>(null);
  const [guides, setGuides] = React.useState<Guides>({ x: null, y: null });
  const [dragPort, setDragPort] = React.useState<keyof typeof PORT_STROKE | null>(null);
  const [prefs, setPrefsState] = React.useState<Prefs>(DEFAULT_PREFS);
  const [outline, setOutline] = React.useState(false);
  const [resultsLimit, setResultsLimit] = React.useState(RESULTS_PAGE);
  const { update: updateAssets } = useAssetMutations();
  const [help, setHelp] = React.useState(false);
  const pointer = React.useRef<{ x: number; y: number } | null>(null);

  // 비동기 콜백(자동 저장·전체 실행)에서 최신 그래프를 읽기 위한 참조
  const nodesRef = React.useRef(nodes);
  const edgesRef = React.useRef(edges);
  const sketchRef = React.useRef(sketch);
  React.useLayoutEffect(() => {
    nodesRef.current = nodes;
    edgesRef.current = edges;
    sketchRef.current = sketch;
  }, [nodes, edges, sketch]);

  // 저장해 둔 조작 설정 불러오기 (localStorage는 마운트 후에만)
  const prefsLoaded = React.useRef(false);
  React.useEffect(() => {
    if (prefsLoaded.current) return;
    prefsLoaded.current = true;
    setPrefsState(loadPrefs());
  }, []);
  const setPrefs = (patch: Partial<Prefs>) =>
    setPrefsState((p) => {
      const next = { ...p, ...patch };
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });

  /* ------------------------------- 실시간 공유 ------------------------------- */
  const presence = usePresence(canvas.id, me, {
    onStroke: (s, final) => {
      const who = s.author?.id ?? "?";
      if (final) {
        setSketch((prev) => (prev.some((x) => x.id === s.id) ? prev : [...prev, s]));
        setRemoteLive((r) => {
          const next = { ...r };
          delete next[who];
          return next;
        });
      } else setRemoteLive((r) => ({ ...r, [who]: s }));
    },
    onLaser: (l) => upsertLaser(l),
    onErase: (ids) => setSketch((prev) => prev.filter((s) => !ids.includes(s.id))),
    onClear: () => setSketch([]),
  });

  function upsertLaser(l: LaserStroke) {
    setLasers((prev) => [...prev.filter((x) => x.id !== l.id), l]);
    if (l.endedAt) setTimeout(() => setLasers((prev) => prev.filter((x) => x.id !== l.id)), 1000);
  }

  const lastLiveSend = React.useRef(0);

  /* ------------------------------- 자동 저장 ------------------------------- */
  const first = React.useRef(true);
  React.useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!canEdit) return;
    // 디바운스 저장 대기 표시 (저장 자체는 아래 타이머에서)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSaveState("saving");
    const t = setTimeout(async () => {
      try {
        const clean = nodesRef.current.map((n) => ({ id: n.id, type: n.type, position: n.position, data: n.data, style: n.style, width: n.width, height: n.height }));
        await fetchJson(`/api/canvases/${canvas.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            graph: {
              nodes: clean,
              edges: edgesRef.current.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle, targetHandle: e.targetHandle, style: e.style })),
              viewport: rf.getViewport(),
              sketch: sketchRef.current,
            },
          }),
        });
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    }, 900);
    return () => clearTimeout(t);
  }, [nodes, edges, sketch, canEdit, canvas.id, rf]);

  async function rename(next: string) {
    if (!next.trim() || next === canvas.name) return;
    await fetchJson(`/api/canvases/${canvas.id}`, { method: "PATCH", body: JSON.stringify({ name: next.trim() }) }).catch(() => {});
  }

  /* ------------------------------- 되돌리기 ------------------------------- */
  const restore = React.useCallback(
    (snap: Snapshot) => {
      setNodes((cur) => mergeRuntime(snap.nodes, cur));
      setEdges(snap.edges);
      setSketch(snap.sketch);
    },
    [setNodes, setEdges],
  );
  const history = useCanvasHistory(nodes, edges, sketch, restore);

  /* ------------------------------ 생성 결과 반영 ------------------------------ */
  const { data: active = [] } = useActiveGenerations();
  // 진행 중 목록(내 것)과 결과 모음(모든 참여자)을 합쳐 두는 곳 — 한쪽만 온 실행도 뒤섞이지 않게
  const genCache = React.useRef(new Map<string, GenerationDTO>());
  const applyGenerations = React.useCallback(
    (gens: GenerationDTO[]) => {
      const cache = genCache.current;
      for (const g of gens) {
        const prev = cache.get(g.id);
        // 끝난 기록을 더 늦게 도착한 진행 중 기록으로 덮지 않아요
        if (prev && TERMINAL_STATUSES.includes(prev.status) && !TERMINAL_STATUSES.includes(g.status)) continue;
        cache.set(g.id, g);
      }
      // 바뀐 노드가 없으면 배열도 그대로 둬요 (캔버스가 처음 크기를 잴 때 새 배열이 들어가면 계속 다시 그려져요)
      setNodes((ns) => {
        let changed = false;
        const next = ns.map((n) => {
          const d = n.data as GenData;
          if (!d.runs?.length) return n;
          const known = d.runs
            .map((id) => cache.get(id))
            .filter((g): g is GenerationDTO => !!g)
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
          if (!known.length) return n;
          const complete = known.length === d.runs.length;
          const running = known.find((g) => !TERMINAL_STATUSES.includes(g.status));
          const outputs = known.flatMap((g) => g.outputs.map(toRef));
          const failed = known.find((g) => g.status === "failed" || g.status === "nsfw");
          const status = running ? running.status : complete ? (outputs.length ? "completed" : failed?.status ?? "failed") : d.status;
          const next: GenData = {
            ...d,
            status,
            // 일부만 알 때는 더 많이 아는 쪽을 유지
            outputs: complete || outputs.length > (d.outputs?.length ?? 0) ? outputs : d.outputs,
            error: !running && complete && !outputs.length ? failed?.errorMessage ?? "생성에 실패했어요." : null,
          };
          if (JSON.stringify(next) === JSON.stringify(d)) return n;
          changed = true;
          return { ...n, data: next };
        });
        return changed ? next : ns;
      });
    },
    [setNodes],
  );
  React.useEffect(() => {
    const mine = active.filter((g) => g.canvasNodeId);
    if (mine.length) applyGenerations(mine);
  }, [active, applyGenerations]);

  /* -------------------------------- 결과 리스트 -------------------------------- */
  const hasResultsNode = nodes.some((n) => n.type === "results");
  const resultsKey = React.useMemo(() => ["generations", "canvas", canvas.id] as const, [canvas.id]);
  const resultsQuery = useQuery({
    queryKey: [...resultsKey, resultsLimit],
    queryFn: () => fetchJson<{ items: CanvasResult[]; hasMore: boolean }>(`/api/canvases/${canvas.id}/results?limit=${resultsLimit}`),
    placeholderData: keepPreviousData,
    // 생성 중이면 자주, 결과 리스트가 있으면 가끔(다른 사람이 돌린 것도 보이게)
    refetchInterval: (q) => (q.state.data?.items.some((g) => ACTIVE_STATUSES.includes(g.status)) ? 2500 : hasResultsNode ? 30_000 : false),
  });
  const resultItems = resultsQuery.data?.items;
  React.useEffect(() => {
    if (resultItems?.length) applyGenerations(resultItems);
  }, [resultItems, applyGenerations]);
  const runs = React.useMemo(() => groupRuns(resultItems ?? []), [resultItems]);
  const resultCounts = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const r of runs) if (r.nodeId) m.set(r.nodeId, (m.get(r.nodeId) ?? 0) + r.outputs.length);
    return m;
  }, [runs]);
  // OK·KEEP·NG는 결과 목록 캐시에 바로 반영해요 (화면도, 실행할 때 읽는 값도 같은 곳)
  const flagOf = React.useCallback((a: { id: string; flag: Flag | null }) => a.flag, []);
  const setFlag = React.useCallback(
    (assetId: string, flag: Flag | null) => {
      qc.setQueriesData<{ items: CanvasResult[]; hasMore: boolean }>({ queryKey: resultsKey }, (d) =>
        d ? { ...d, items: d.items.map((g) => (g.outputs.some((o) => o.id === assetId) ? { ...g, outputs: g.outputs.map((o) => (o.id === assetId ? { ...o, flag } : o)) } : g)) } : d,
      );
      void updateAssets([assetId], { flag });
    },
    [qc, resultsKey, updateAssets],
  );

  /** 결과 리스트에 이어진 생성 노드 */
  const sourcesOf = React.useCallback((listId: string, es: Edge[]) => Array.from(new Set(es.filter((e) => e.target === listId && e.targetHandle === "collect").map((e) => e.source))), []);
  /** 결과 리스트에서 OK한 결과 (최신 순) — 화면에 그릴 때 */
  const okNow = React.useCallback(
    (listId: string) => {
      const sources = new Set(sourcesOf(listId, edges));
      return runs
        .filter((r) => r.nodeId && sources.has(r.nodeId))
        .flatMap((r) => r.outputs)
        .filter((o) => flagOf(o) === "pick");
    },
    [sourcesOf, edges, runs, flagOf],
  );

  /* ---------------------------------- 실행 ---------------------------------- */
  type Dim = { handle: string; texts?: string[]; assets?: RefAsset[] };

  /** 들어오는 연결 모으기 — 반복 입력은 "차원"으로 따로 (항목마다 한 번씩 실행) */
  const gather = React.useCallback((nodeId: string) => {
    const ns = rf.getNodes();
    const es = rf.getEdges();
    const incoming = es.filter((e) => e.target === nodeId);
    const prompts: string[] = [];
    const images: string[] = [];
    const videos: string[] = [];
    const dims: Dim[] = [];
    const refsFromLists: string[] = [];
    let start: string | undefined;
    let end: string | undefined;
    let missing: string | null = null;
    for (const e of incoming) {
      const src = ns.find((n) => n.id === e.source);
      if (!src) continue;
      if (src.type === "results") {
        // 결과 리스트에서 OK한 것: 레퍼런스는 한꺼번에, 시작·끝 프레임과 영상은 하나씩 돌려요
        const sources = new Set(es.filter((x) => x.target === src.id && x.targetHandle === "collect").map((x) => x.source));
        const latest = qc.getQueryData<{ items: CanvasResult[] }>([...resultsKey, resultsLimit])?.items ?? [];
        const ok = latest
          .filter((g) => g.canvasNodeId && sources.has(g.canvasNodeId))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .flatMap((g) => g.outputs)
          .filter((o) => o.flag === "pick")
          .map(toRef);
        const want = ok.filter((a) => a.kind === (e.targetHandle === "videoIn" ? "video" : "image"));
        if (!want.length) {
          missing = `${TYPE_LABEL.results}에 OK한 ${e.targetHandle === "videoIn" ? "영상이" : "이미지가"} 없어요. 넘길 결과에 OK를 눌러 주세요.`;
          continue;
        }
        if (e.targetHandle === "refs") refsFromLists.push(...want.map((a) => a.id));
        else if (e.targetHandle) dims.push({ handle: e.targetHandle, assets: want });
        continue;
      }
      if (src.type === "list") {
        const d = src.data as ListData;
        if (d.mode === "image") {
          const assets = (d.assets ?? []).filter((a) => a.kind === "image");
          if (assets.length && e.targetHandle && ["refs", "start", "end"].includes(e.targetHandle)) dims.push({ handle: e.targetHandle, assets });
        } else {
          const texts = (d.items ?? []).map((t) => t.trim()).filter(Boolean);
          if (texts.length && e.targetHandle === "prompt") dims.push({ handle: "prompt", texts });
        }
        continue;
      }
      let text: string | undefined;
      let asset: RefAsset | undefined;
      if (src.type === "prompt") text = (src.data as PromptData).text;
      else if (src.type === "imageInput" || src.type === "videoInput") asset = (src.data as AssetInputData).asset;
      else if (src.type === "imageGen" || src.type === "videoGen") {
        asset = chosenOutput(src.data as GenData);
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
    return { prompts, images: [...images, ...refsFromLists], videos, start, end, dims, missing };
  }, [rf, qc, resultsKey, resultsLimit]);

  const fanOut = React.useCallback(
    (nodeId: string) => {
      const incoming = edges.filter((e) => e.target === nodeId);
      let n = 1;
      for (const e of incoming) {
        const src = nodes.find((x) => x.id === e.source);
        if (src?.type === "results") {
          if (e.targetHandle === "refs") continue;
          const len = okNow(src.id).filter((a) => a.kind === (e.targetHandle === "videoIn" ? "video" : "image")).length;
          if (len) n *= len;
          continue;
        }
        if (src?.type !== "list") continue;
        const d = src.data as ListData;
        const len = d.mode === "image" ? (d.assets ?? []).length : (d.items ?? []).filter((t) => t.trim()).length;
        if (len) n *= len;
      }
      return n;
    },
    [nodes, edges, okNow],
  );

  const runNode = React.useCallback(
    async (nodeId: string) => {
      const node = rf.getNode(nodeId);
      if (!node || (node.type !== "imageGen" && node.type !== "videoGen")) return;
      const d = node.data as GenData;
      const model = getModel(d.modelId);
      if (!model) return;
      const g = gather(nodeId);
      if (g.missing) {
        toast.error(g.missing);
        return;
      }
      // 반복 입력 조합 만들기 (카테시안 곱)
      let combos: Record<string, string | RefAsset>[] = [{}];
      for (const dim of g.dims) {
        const values: (string | RefAsset)[] = dim.texts ?? dim.assets ?? [];
        combos = combos.flatMap((c) => values.map((v) => ({ ...c, [dim.handle]: v })));
      }
      if (combos.length > MAX_FAN_OUT) {
        toast.error(`반복 입력 조합이 ${combos.length}개예요. 한 번에 ${MAX_FAN_OUT}개까지 실행할 수 있어요.`);
        return;
      }
      const params = sanitizeParams(model, { ...defaultParams(model), ...(d.params ?? {}) });
      rf.updateNodeData(nodeId, { status: "pending", error: null });
      const runs: string[] = [];
      try {
        for (const c of combos) {
          const listText = typeof c.prompt === "string" ? c.prompt : undefined;
          const asset = (h: string) => (c[h] && typeof c[h] !== "string" ? (c[h] as RefAsset).id : undefined);
          const prompt = [...g.prompts, listText, d.text?.trim()].filter(Boolean).join("\n");
          const res = await createGenerationRequest({
            modelId: model.id,
            prompt,
            params,
            inputs: {
              images: [...g.images, ...(asset("refs") ? [asset("refs")!] : [])],
              videos: [...g.videos, ...(asset("videoIn") ? [asset("videoIn")!] : [])],
              startFrame: asset("start") ?? g.start,
              endFrame: asset("end") ?? g.end,
            },
            count: d.count ?? 1,
            projectId: canvas.projectId,
            canvasId: canvas.id,
            canvasNodeId: nodeId,
          });
          runs.push(...res.generations.map((x) => x.id));
          push(res.generations);
        }
        rf.updateNodeData(nodeId, { runs, status: "pending", selected: 0, pickId: null, outputs: [] });
        if (combos.length > 1) toast.success(`반복 입력 ${combos.length}개 조합으로 실행했어요`);
      } catch (e) {
        if (runs.length) rf.updateNodeData(nodeId, { runs, status: "pending", selected: 0, pickId: null, outputs: [] });
        else rf.updateNodeData(nodeId, { status: "failed", error: (e as Error).message });
        toast.error((e as Error).message);
      } finally {
        void qc.invalidateQueries({ queryKey: resultsKey });
      }
    },
    [gather, rf, canvas.projectId, canvas.id, push, qc, resultsKey],
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

  /* --------------------------------- 연결 --------------------------------- */
  const onConnect = React.useCallback(
    (c: Connection) => {
      const s = nodesRef.current.find((n) => n.id === c.source);
      const t = nodesRef.current.find((n) => n.id === c.target);
      const a = portType(s?.type, c.sourceHandle);
      const b = portType(t?.type, c.targetHandle);
      if (c.source === c.target) return;
      if (!canConnect(a, b)) {
        toast.error(
          b === "media"
            ? "결과 리스트에는 이미지·영상 생성 노드의 출력을 이어 주세요."
            : "같은 종류끼리만 연결할 수 있어요. (텍스트↔텍스트, 이미지↔이미지, 영상↔영상)",
        );
        return;
      }
      setEdges((es) => {
        // 시작/끝 프레임은 하나만
        const filtered = c.targetHandle === "start" || c.targetHandle === "end" ? es.filter((e) => !(e.target === c.target && e.targetHandle === c.targetHandle)) : es;
        return addEdge({ ...c, style: edgeStyle(edgePort(c)) }, filtered);
      });
    },
    [setEdges],
  );

  /** 선을 빈 곳에 놓으면 → 이어 붙일 노드 추천 */
  const onConnectEnd = React.useCallback(
    (event: MouseEvent | TouchEvent, state: FinalConnectionState) => {
      setDragPort(null);
      if (!canEdit || state.isValid || !state.fromHandle || !state.fromNode) return;
      const port = portType(state.fromNode.type, state.fromHandle.id);
      if (!port) return;
      const pt = "changedTouches" in event ? event.changedTouches[0] : event;
      setQuick({
        at: { x: pt.clientX, y: pt.clientY },
        flow: rf.screenToFlowPosition({ x: pt.clientX, y: pt.clientY }),
        from: { nodeId: state.fromNode.id, handleId: state.fromHandle.id ?? "", handleType: state.fromHandle.type, port },
      });
    },
    [canEdit, rf],
  );

  function newId(type?: string) {
    return `${type ?? "n"}-${randomId()}`;
  }

  function addNodeAt(choice: QuickAddChoice, flow: { x: number; y: number }, from: QuickAddFrom | null) {
    const def = NODE_DEF[choice.type];
    const id = newId(choice.type);
    const width = NODE_WIDTH[choice.type] ?? 280;
    // 출력에서 끌었으면 새 노드를 오른쪽에, 입력에서 끌었으면 왼쪽에
    const x = from?.handleType === "target" ? flow.x - width - 12 : from ? flow.x + 12 : flow.x - width / 2;
    const y = flow.y - (from ? 40 : 60);
    setNodes((ns) => [
      ...ns.map((n) => ({ ...n, selected: false })),
      { id, type: choice.type, position: { x, y }, data: structuredClone(choice.data), selected: true, ...(def.style ? { style: def.style } : {}) },
    ]);
    if (from && choice.handle) {
      const edge =
        from.handleType === "source"
          ? { id: `e-${randomId()}`, source: from.nodeId, sourceHandle: from.handleId, target: id, targetHandle: choice.handle }
          : { id: `e-${randomId()}`, source: id, sourceHandle: choice.handle, target: from.nodeId, targetHandle: from.handleId };
      setEdges((es) => {
        const filtered = edge.targetHandle === "start" || edge.targetHandle === "end" ? es.filter((e) => !(e.target === edge.target && e.targetHandle === edge.targetHandle)) : es;
        return [...filtered, { ...edge, style: edgeStyle(edgePort(edge)) }];
      });
    }
    return id;
  }

  function addNode(type: NodeKind, screen?: { x: number; y: number }) {
    const at = screen ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    addNodeAt({ type, data: NODE_DEF[type].make() }, rf.screenToFlowPosition(at), null);
  }

  /* ------------------------ 끌기: 스마트 가이드·격자 ------------------------ */
  const handleNodesChange = React.useCallback(
    (changes: NodeChange<Node>[]) => {
      if (!canEdit) return;
      const c = changes[0];
      if (changes.length === 1 && c.type === "position" && c.dragging && c.position && !prefs.snap) {
        const res = snapToGuides(c, nodesRef.current, 7 / rf.getZoom());
        c.position = res.position;
        setGuides(res.guides);
      } else if (changes.some((x) => x.type === "position" && x.dragging === false)) {
        setGuides({ x: null, y: null });
      }
      onNodesChange(changes);
    },
    [canEdit, prefs.snap, rf, onNodesChange],
  );

  /* ------------------------------ 단축키 ------------------------------ */
  const deleteSelected = React.useCallback(() => {
    setNodes((ns) => ns.filter((n) => !n.selected));
    setEdges((es) => es.filter((e) => !e.selected));
  }, [setNodes, setEdges]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      if (mod && k === "z") {
        e.preventDefault();
        if (!canEdit) return;
        const ok = e.shiftKey ? history.redo() : history.undo();
        if (!ok) toast(e.shiftKey ? "다시 할 작업이 없어요" : "되돌릴 작업이 없어요");
        return;
      }
      if (mod && k === "y") {
        e.preventDefault();
        if (canEdit) history.redo();
        return;
      }
      if (mod && k === "a") {
        e.preventDefault();
        setNodes((ns) => ns.map((n) => ({ ...n, selected: true })));
        return;
      }
      if (mod && k === "c") {
        const n = copyToClipboard(nodesRef.current, edgesRef.current);
        if (n) toast(`노드 ${n}개를 복사했어요`);
        return;
      }
      if (mod && (k === "v" || k === "d") && canEdit) {
        e.preventDefault();
        const src = k === "d" ? { nodes: nodesRef.current.filter((n) => n.selected), edges: edgesRef.current } : readClipboard();
        if (!src?.nodes.length) return;
        let offset = { x: 40, y: 40 };
        if (k === "v" && pointer.current) {
          const at = rf.screenToFlowPosition(pointer.current);
          const minX = Math.min(...src.nodes.map((n) => n.position.x));
          const minY = Math.min(...src.nodes.map((n) => n.position.y));
          offset = { x: at.x - minX, y: at.y - minY };
        }
        const out = cloneGraph(src.nodes, src.edges, offset, newId);
        const clearRuntime = (n: Node) => ({ ...n, data: Object.fromEntries(Object.entries(n.data).filter(([key]) => !["runs", "status", "error"].includes(key))) });
        setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), ...out.nodes.map(clearRuntime)]);
        setEdges((es) => [...es, ...out.edges]);
        return;
      }
      if (mod && (k === "=" || k === "+")) {
        e.preventDefault();
        void rf.zoomIn({ duration: 220 });
        return;
      }
      if (mod && k === "-") {
        e.preventDefault();
        void rf.zoomOut({ duration: 220 });
        return;
      }
      if (mod && k === "0") {
        e.preventDefault();
        void rf.zoomTo(1, { duration: 280 });
        return;
      }
      if (mod) return;
      if (e.shiftKey && k === "!") return void rf.fitView({ duration: 450, padding: 0.18, maxZoom: 1.1 });
      if (e.shiftKey && e.code === "Digit1") return void rf.fitView({ duration: 450, padding: 0.18, maxZoom: 1.1 });
      if (e.shiftKey && e.code === "Digit2") {
        const sel = nodesRef.current.filter((n) => n.selected);
        if (sel.length) void rf.fitView({ nodes: sel, duration: 450, padding: 0.35, maxZoom: 1.3 });
        return;
      }
      if (k === "v") return setMode("select");
      if (k === "h") return setMode("pan");
      if (k === "p" && canEdit) return setMode("pen");
      if (k === "l") return setMode("laser");
      if (k === "e" && canEdit) return setMode("eraser");
      if (k === "escape") {
        setMode("select");
        setQuick(null);
        return;
      }
      if ((k === "/" || k === "tab") && canEdit) {
        e.preventDefault();
        const at = pointer.current ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 };
        setQuick({ at, flow: rf.screenToFlowPosition(at), from: null });
        return;
      }
      if (k === "?") return setHelp((h) => !h);
      if (k.startsWith("arrow") && canEdit) {
        const sel = nodesRef.current.some((n) => n.selected);
        if (!sel) return;
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = k === "arrowleft" ? -step : k === "arrowright" ? step : 0;
        const dy = k === "arrowup" ? -step : k === "arrowdown" ? step : 0;
        setNodes((ns) => ns.map((n) => (n.selected ? { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } } : n)));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canEdit, history, rf, setNodes, setEdges]);

  /* --------------------------------- 표시 --------------------------------- */
  const runningIds = React.useMemo(
    () => new Set(nodes.filter((n) => ["pending", "queued", "in_progress", "finalizing"].includes(String((n.data as GenData).status ?? ""))).map((n) => n.id)),
    [nodes],
  );
  const shownEdges = React.useMemo(() => edges.map((e) => (runningIds.has(e.target) ? { ...e, animated: true } : e)), [edges, runningIds]);

  /* ------------------------------- 노드 이름 ------------------------------- */
  // 같은 종류가 여러 개면 만든 순서대로 번호 (이미지 생성 1, 이미지 생성 2 …)
  const labelSig = nodes.map((n) => `${n.id}:${n.type}`).join("|");
  const labels = React.useMemo(() => {
    const byType = new Map<string, string[]>();
    for (const part of labelSig ? labelSig.split("|") : []) {
      const [id, type] = part.split(":");
      byType.set(type, [...(byType.get(type) ?? []), id]);
    }
    const out = new Map<string, string>();
    for (const [type, ids] of byType) ids.forEach((id, i) => out.set(id, ids.length > 1 ? `${TYPE_LABEL[type] ?? type} ${i + 1}` : TYPE_LABEL[type] ?? type));
    return out;
  }, [labelSig]);
  const nodeLabel = React.useCallback((id: string) => labels.get(id) ?? "노드", [labels]);

  /* ---------------------------- 결과 리스트 동작 ---------------------------- */
  const focusNode = React.useCallback(
    (id: string) => {
      const n = rf.getNode(id);
      if (!n) return;
      setNodes((ns) => ns.map((x) => ({ ...x, selected: x.id === id })));
      void rf.fitView({ nodes: [n], duration: 500, padding: 0.6, maxZoom: 1.2 });
    },
    [rf, setNodes],
  );

  /** 겹치지 않는 자리 찾기 (후보를 차례로 보고, 다 겹치면 첫 후보) */
  const freeSpot = React.useCallback((all: Node[], candidates: { x: number; y: number }[], size: { w: number; h: number }) => {
    const boxes = all.map((n) => ({ x: n.position.x, y: n.position.y, w: n.measured?.width ?? n.width ?? 300, h: n.measured?.height ?? n.height ?? 200 }));
    const hit = (p: { x: number; y: number }) => boxes.some((b) => p.x < b.x + b.w + 24 && p.x + size.w + 24 > b.x && p.y < b.y + b.h + 24 && p.y + size.h + 24 > b.y);
    return candidates.find((p) => !hit(p)) ?? candidates[0];
  }, []);

  /** 생성 노드의 결과 리스트로: 이어진 게 있으면 그리로, 없으면 옆에 만들어 이어요 */
  const collectResults = React.useCallback(
    (genId: string) => {
      const linked = rf.getEdges().find((e) => e.source === genId && e.targetHandle === "collect");
      if (linked) return focusNode(linked.target);
      const all = rf.getNodes();
      const src = all.find((n) => n.id === genId);
      if (!src || !canEdit) return;
      const def = NODE_DEF.results;
      const size = { w: def.style!.width, h: def.style!.height };
      const w = src.measured?.width ?? 340;
      const h = src.measured?.height ?? 520;
      const pos = freeSpot(
        all,
        [
          { x: src.position.x + w + 90, y: src.position.y },
          { x: src.position.x, y: src.position.y + h + 70 },
          { x: src.position.x + w + 90, y: src.position.y + h + 70 },
        ],
        size,
      );
      const id = newId("results");
      const handle = src.type === "videoGen" ? "video" : "image";
      setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), { id, type: "results", position: pos, data: def.make(), style: def.style, selected: true }]);
      setEdges((es) => [...es, { id: `e-${randomId()}`, source: genId, sourceHandle: handle, target: id, targetHandle: "collect", style: edgeStyle(handle) }]);
      setTimeout(() => {
        const n = rf.getNode(id);
        if (n) void rf.fitView({ nodes: [n, src], duration: 500, padding: 0.25, maxZoom: Math.max(rf.getZoom(), 0.7) });
      }, 60);
    },
    [canEdit, focusNode, freeSpot, rf, setNodes, setEdges],
  );

  /** 결과를 캔버스에 입력 노드로 꺼내기 (결과 리스트 오른쪽에 차례로) */
  const placeAsset = React.useCallback(
    (asset: RefAsset, nearId: string | null) => {
      const all = rf.getNodes();
      const near = nearId ? all.find((n) => n.id === nearId) : undefined;
      const step = all.filter((n) => n.type === "imageInput" || n.type === "videoInput").length % 6;
      const pos = near
        ? { x: near.position.x + (near.measured?.width ?? 340) + 90, y: near.position.y + step * 44 }
        : rf.screenToFlowPosition({ x: window.innerWidth / 2 - 200 + step * 24, y: window.innerHeight / 2 + step * 24 });
      const id = newId(`${asset.kind}Input`);
      setNodes((ns) => [
        ...ns.map((n) => ({ ...n, selected: false })),
        { id, type: asset.kind === "image" ? "imageInput" : "videoInput", position: pos, data: { asset }, selected: true },
      ]);
      setTimeout(() => {
        const n = rf.getNode(id);
        if (n) void rf.fitView({ nodes: [n], duration: 450, padding: 1.2, maxZoom: Math.max(rf.getZoom(), 0.6) });
      }, 60);
    },
    [rf, setNodes],
  );

  const listRuns = React.useCallback(
    (listId: string) => {
      const sources = new Set(sourcesOf(listId, edges));
      return runs.filter((r) => r.nodeId && sources.has(r.nodeId));
    },
    [runs, edges, sourcesOf],
  );
  const listSources = React.useCallback((listId: string) => sourcesOf(listId, edges), [edges, sourcesOf]);
  const loadMore = React.useCallback(() => setResultsLimit((l) => Math.min(300, l + RESULTS_PAGE)), []);

  const totalEstimate = nodes.reduce((sum, n) => {
    if (n.type !== "imageGen" && n.type !== "videoGen") return sum;
    const d = n.data as GenData;
    const m = getModel(d.modelId);
    if (!m) return sum;
    const params = sanitizeParams(m, { ...defaultParams(m), ...(d.params ?? {}) });
    const count = Math.min(m.count.max, d.count ?? 1);
    const per = m.count.native ? [count] : Array.from({ length: count }, () => 1);
    const one = per.reduce((s, c) => s + m.estimate({ params, count: c, refImages: 0, hasStartFrame: false, refVideos: 0, inputVideoSeconds: 0, now: new Date() }, status[m.id]?.priceOverrides ?? {}), 0);
    return sum + one * fanOut(n.id);
  }, 0);

  const ctx = React.useMemo(
    () => ({
      canvasId: canvas.id,
      projectId: canvas.projectId,
      meId: me.id,
      canEdit,
      status,
      runNode,
      fanOut,
      pickAsset: (nodeId: string, kind: "image" | "video", multiple?: boolean) => setPicker({ nodeId, kind, multiple }),
      openAsset: (a: RefAsset) => setLightbox({ items: [{ id: a.id, kind: a.kind, urls: a.urls, width: a.width, height: a.height, durationSec: a.durationSec, filename: a.filename }], index: 0 }),
      openAssets: (items: LightboxItem[], index: number) => setLightbox({ items, index }),
      nodeLabel,
      resultCount: (id: string) => resultCounts.get(id) ?? 0,
      collectResults,
      listRuns,
      listSources,
      results: { loading: resultsQuery.isLoading, hasMore: !!resultsQuery.data?.hasMore, loadMore },
      flagOf,
      setFlag,
      placeAsset,
    }),
    [
      canvas.id,
      canvas.projectId,
      me.id,
      canEdit,
      status,
      runNode,
      fanOut,
      nodeLabel,
      resultCounts,
      collectResults,
      listRuns,
      listSources,
      resultsQuery.isLoading,
      resultsQuery.data?.hasMore,
      loadMore,
      flagOf,
      setFlag,
      placeAsset,
    ],
  );

  const figma = prefs.wheel === "pan";
  const drawing = mode === "pen" || mode === "laser" || mode === "eraser";

  return (
    <CanvasContext.Provider value={ctx}>
      <div
        className={cn("canvas-surface relative h-[calc(100dvh-56px)] w-full", mode === "pan" && "cursor-grab")}
        data-hotkeys-scope
        data-owns-slash
        onPointerMove={(e) => {
          pointer.current = { x: e.clientX, y: e.clientY };
          presence.sendCursor(rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }), mode);
        }}
        onPointerLeave={() => presence.sendCursor(null)}
        onDoubleClick={(e) => {
          if (!canEdit || drawing) return;
          if (!(e.target as HTMLElement).classList.contains("react-flow__pane")) return;
          setQuick({ at: { x: e.clientX, y: e.clientY }, flow: rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }), from: null });
        }}
      >
        <ReactFlow
          nodes={nodes}
          edges={shownEdges}
          onNodesChange={canEdit ? handleNodesChange : undefined}
          onEdgesChange={canEdit ? onEdgesChange : undefined}
          onConnect={canEdit ? onConnect : undefined}
          onConnectStart={(_, p) => {
            const n = nodesRef.current.find((x) => x.id === p.nodeId);
            setDragPort(portType(n?.type, p.handleId));
          }}
          onConnectEnd={onConnectEnd}
          nodeTypes={NODE_TYPES}
          defaultViewport={canvas.graph.viewport}
          fitView={!canvas.graph.viewport}
          fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
          minZoom={0.1}
          maxZoom={2.5}
          proOptions={{ hideAttribution: true }}
          deleteKeyCode={canEdit ? ["Backspace", "Delete"] : null}
          nodesDraggable={canEdit && mode === "select"}
          nodesConnectable={canEdit && mode === "select"}
          elementsSelectable={mode === "select"}
          // 조작감: Figma식(휠=이동, ⌘/Ctrl+휠·핀치=확대, 빈 곳 끌기=선택) 또는 휠=확대
          panOnScroll={figma}
          zoomOnScroll={!figma}
          zoomOnPinch
          panOnDrag={mode === "pan" ? true : figma ? [1, 2] : true}
          selectionOnDrag={figma && mode === "select"}
          zoomOnDoubleClick={false}
          snapToGrid={prefs.snap}
          snapGrid={[20, 20]}
          connectionRadius={36}
          connectionLineStyle={{ stroke: dragPort ? PORT_STROKE[dragPort] : "var(--fg-3)", strokeWidth: 2, strokeDasharray: "6 4" }}
          defaultEdgeOptions={{ interactionWidth: 18 }}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
          }}
          onDrop={(e) => {
            e.preventDefault();
            const type = e.dataTransfer.getData("application/x-zipup-node") as NodeKind;
            const asset = e.dataTransfer.getData("application/x-zipup-asset");
            if (type && NODE_DEF[type]) addNode(type, { x: e.clientX, y: e.clientY });
            else if (asset) {
              const a = JSON.parse(asset) as RefAsset;
              const pos = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
              setNodes((ns) => [...ns, { id: newId(`${a.kind}Input`), type: a.kind === "image" ? "imageInput" : "videoInput", position: pos, data: { asset: a } }]);
            }
          }}
          className="bg-bg"
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} color="var(--grid-dot)" />
          {prefs.minimap && (
            <MiniMap
              position="bottom-left"
              pannable
              zoomable
              className="!rounded-xl !border !border-line-2"
              maskColor="rgb(0 0 0 / 0.5)"
              nodeColor={(n) => (n.type === "imageGen" || n.type === "imageInput" ? "#1ea7ff" : n.type === "videoGen" || n.type === "videoInput" ? "#a48bff" : n.type === "note" ? "#f5b83d" : n.type === "results" ? "#6cc8ff" : "#4a5560")}
            />
          )}

          <SketchStrokes strokes={sketch} live={[...(liveStroke ? [liveStroke] : []), ...Object.values(remoteLive)]} lasers={lasers} />
          <RemoteCursors peers={presence.peers} />
          <GuideLines guides={guides} />

          {/* 상단 왼쪽: 이름·저장 상태 */}
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
                  <>
                    <Loader2 className="size-3 animate-spin" /> 저장 중
                  </>
                ) : saveState === "error" ? (
                  <>
                    <CloudOff className="size-3 text-danger" /> 저장 실패
                  </>
                ) : (
                  <>
                    <Check className="size-3" /> 저장됨
                  </>
                )}
              </span>
              {canEdit && (
                <span className="ml-1 flex items-center border-l border-line pl-1.5">
                  <Tip content="되돌리기" shortcut="⌘Z">
                    <Button variant="ghost" size="icon-xs" disabled={!history.canUndo} onClick={() => history.undo()} aria-label="되돌리기">
                      <Undo2 />
                    </Button>
                  </Tip>
                  <Tip content="다시 하기" shortcut="⇧⌘Z">
                    <Button variant="ghost" size="icon-xs" disabled={!history.canRedo} onClick={() => history.redo()} aria-label="다시 하기">
                      <Redo2 />
                    </Button>
                  </Tip>
                </span>
              )}
            </div>
          </Panel>

          {/* 상단 가운데: 도구 (선택·이동·펜·레이저·지우개) */}
          <Panel position="top-center" className="!mt-3">
            <SketchToolbar
              mode={mode}
              onMode={setMode}
              color={penColor}
              onColor={setPenColor}
              count={sketch.length}
              canEdit={canEdit}
              onClear={async () => {
                if (!(await confirm({ title: "스케치를 모두 지울까요?", description: `${sketch.length}개의 선이 지워져요. ⌘Z로 되돌릴 수 있어요.`, confirmLabel: "지우기", danger: true }))) return;
                setSketch([]);
                presence.sendClear();
              }}
            />
          </Panel>

          {/* 상단 오른쪽: 참여자·목록·실행 */}
          <Panel position="top-right" className="!m-3">
            <div className="glass flex items-center gap-2 rounded-2xl p-1.5 shadow-[var(--shadow-soft)]">
              <span className="pl-1.5">
                <PeerStack peers={presence.peers} status={presence.status} me={me} />
              </span>
              <Tip content="노드 목록">
                <Button
                  variant={outline ? "secondary" : "ghost"}
                  size="icon-sm"
                  onClick={() => setOutline((o) => !o)}
                  aria-label="노드 목록"
                >
                  <LayoutList />
                </Button>
              </Tip>
              <span className="px-1 font-mono text-[12px] text-fg-3">예상 {usd(Math.round(totalEstimate * 1_000_000))}</span>
              <Button variant="primary" size="sm" disabled={!canEdit || runningAll} loading={runningAll} onClick={runAll} className="glow-ring">
                {!runningAll && <Play className="fill-current" />} 전체 실행
              </Button>
            </div>
          </Panel>

          {/* 왼쪽: 노드 팔레트 */}
          {canEdit && (
            <Panel position="center-left" className="!m-3">
              <div className="glass flex flex-col gap-1 rounded-2xl p-1.5 shadow-[var(--shadow-soft)]">
                {NODE_DEFS.map((p) => {
                  const Icon = p.icon;
                  return (
                    <Tip key={p.type} content={`${p.label} — ${p.desc} (클릭 또는 드래그)`} side="right">
                      <button
                        type="button"
                        draggable
                        onDragStart={(e) => e.dataTransfer.setData("application/x-zipup-node", p.type)}
                        onClick={() => addNode(p.type)}
                        className={cn(
                          "flex size-10 items-center justify-center rounded-xl text-fg-2 transition hover:bg-panel-3 hover:text-fg",
                          p.tone === "image" && "text-accent",
                          p.tone === "video" && "text-info",
                          p.tone === "media" && "text-accent-2",
                        )}
                      >
                        <Icon className="size-[18px]" />
                      </button>
                    </Tip>
                  );
                })}
                <span className="mx-2 my-1 h-px bg-line" />
                <Tip content="선택한 노드 삭제" side="right" shortcut="⌫">
                  <button type="button" onClick={deleteSelected} className="flex size-10 items-center justify-center rounded-xl text-fg-3 transition hover:bg-danger/10 hover:text-danger">
                    <Trash2 className="size-[18px]" />
                  </button>
                </Tip>
              </div>
            </Panel>
          )}

          {/* 오른쪽 아래: 확대·맞추기·설정 */}
          <Panel position="bottom-right" className="!m-3">
            <ZoomBar
              prefs={prefs}
              onPrefs={setPrefs}
              onHelp={() => setHelp(true)}
              onZoomIn={() => void rf.zoomIn({ duration: 220 })}
              onZoomOut={() => void rf.zoomOut({ duration: 220 })}
              onReset={() => void rf.zoomTo(1, { duration: 280 })}
              onFit={() => void rf.fitView({ duration: 450, padding: 0.18, maxZoom: 1.1 })}
            />
          </Panel>

          {nodes.length === 0 && (
            <Panel position="top-center" className="!mt-28">
              <div className="flex flex-col items-center gap-2 text-center">
                <p className="text-[15px] font-semibold">빈 캔버스예요</p>
                <p className="text-sm text-fg-3">빈 곳을 더블클릭하거나 / 를 눌러 노드를 추가하고, 포트를 끌어 빈 곳에 놓으면 이어 붙일 노드를 추천해요.</p>
              </div>
            </Panel>
          )}

          <Panel position="bottom-center" className="!mb-4 hidden xl:block">
            <p className="flex items-center gap-2 rounded-full border border-line bg-panel/80 px-3 py-1.5 text-[11px] text-fg-4 backdrop-blur">
              <span className="size-2 rounded-full" style={{ background: "#f4f4f5" }} /> 텍스트
              <span className="size-2 rounded-full bg-accent" /> 이미지
              <span className="size-2 rounded-full bg-info" /> 영상 · 선을 빈 곳에 놓으면 추천 · 더블클릭 추가 · <Kbd>P</Kbd> 펜 <Kbd>L</Kbd> 레이저 · <Kbd>?</Kbd> 단축키
            </p>
          </Panel>

          {drawing && (
            <ZoomedSketchCapture
              mode={mode}
              color={penColor}
              strokes={sketch}
              me={me}
              onLive={(s) => {
                setLiveStroke(s);
                const now = performance.now();
                if (s && now - lastLiveSend.current > 45) {
                  lastLiveSend.current = now;
                  presence.sendStroke(s, false);
                }
              }}
              onCommit={(s) => {
                setSketch((prev) => [...prev, s]);
                presence.sendStroke(s, true);
              }}
              onLaser={(l) => {
                upsertLaser(l);
                const now = performance.now();
                if (l.endedAt || now - lastLiveSend.current > 45) {
                  lastLiveSend.current = now;
                  presence.sendLaser(l);
                }
              }}
              onErase={(ids) => {
                setSketch((prev) => prev.filter((s) => !ids.includes(s.id)));
                presence.sendErase(ids);
              }}
            />
          )}
        </ReactFlow>

        {outline && <Outline nodes={nodes} label={nodeLabel} onClose={() => setOutline(false)} onFocus={(n) => focusNode(n.id)} />}


        {help && <ShortcutHelp onClose={() => setHelp(false)} />}
      </div>

      {quick && (
        <QuickAdd
          at={quick.at}
          from={quick.from}
          onClose={() => setQuick(null)}
          onPick={(choice) => {
            addNodeAt(choice, quick.flow, quick.from);
            setQuick(null);
          }}
        />
      )}

      <AssetPicker
        open={!!picker}
        onOpenChange={(o) => !o && setPicker(null)}
        kind={picker?.kind}
        max={picker?.multiple ? 20 : 1}
        projectId={canvas.projectId}
        onPick={(items) => {
          if (!picker) return;
          const node = nodesRef.current.find((n) => n.id === picker.nodeId);
          if (node?.type === "list") {
            const d = node.data as ListData;
            const merged = [...(d.assets ?? []), ...items.filter((i) => !(d.assets ?? []).some((a) => a.id === i.id))];
            rf.updateNodeData(picker.nodeId, { assets: merged });
          } else rf.updateNodeData(picker.nodeId, { asset: items[0] });
        }}
      />
      {lightbox && (
        <Lightbox items={lightbox.items} index={lightbox.index} onIndexChange={(index) => setLightbox((l) => (l ? { ...l, index } : l))} onClose={() => setLightbox(null)} />
      )}
      {confirmDialog}
    </CanvasContext.Provider>
  );
}

/* --------------------------------- 보조 UI --------------------------------- */

function GuideLines({ guides }: { guides: Guides }) {
  if (guides.x === null && guides.y === null) return null;
  return (
    <ViewportPortal>
      {guides.x !== null && <div className="pointer-events-none absolute w-px bg-accent/80" style={{ left: guides.x, top: -100000, height: 200000, zIndex: 30 }} />}
      {guides.y !== null && <div className="pointer-events-none absolute h-px bg-accent/80" style={{ top: guides.y, left: -100000, width: 200000, zIndex: 30 }} />}
    </ViewportPortal>
  );
}

/** 펜 굵기는 화면 배율에 맞춰요 (배율이 바뀔 때 이 부분만 다시 그려요) */
function ZoomedSketchCapture(props: Omit<React.ComponentProps<typeof SketchCapture>, "size">) {
  const { zoom } = useViewport();
  return <SketchCapture {...props} size={6 / Math.max(zoom, 0.25)} />;
}

function ZoomBar({
  prefs,
  onPrefs,
  onZoomIn,
  onZoomOut,
  onReset,
  onFit,
  onHelp,
}: {
  prefs: Prefs;
  onPrefs: (p: Partial<Prefs>) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  onFit: () => void;
  onHelp: () => void;
}) {
  // 배율 표시만 화면 이동·확대를 따라 다시 그려요 (캔버스 전체가 아니라)
  const { zoom } = useViewport();
  return (
    <div className="glass flex items-center gap-0.5 rounded-2xl p-1 shadow-[var(--shadow-soft)]">
      <Tip content="축소" shortcut="⌘-">
        <Button variant="ghost" size="icon-sm" onClick={onZoomOut} aria-label="축소">
          <Minus />
        </Button>
      </Tip>
      <Tip content="100%로" shortcut="⌘0">
        <button type="button" onClick={onReset} className="w-12 rounded-lg py-1 text-center font-mono text-[11.5px] tabular-nums text-fg-2 hover:bg-panel-3">
          {Math.round(zoom * 100)}%
        </button>
      </Tip>
      <Tip content="확대" shortcut="⌘+">
        <Button variant="ghost" size="icon-sm" onClick={onZoomIn} aria-label="확대">
          <Plus />
        </Button>
      </Tip>
      <Tip content="전체 보기" shortcut="⇧1">
        <Button variant="ghost" size="icon-sm" onClick={onFit} aria-label="전체 보기">
          <Maximize />
        </Button>
      </Tip>
      <Tip content="미니맵">
        <Button variant={prefs.minimap ? "secondary" : "ghost"} size="icon-sm" onClick={() => onPrefs({ minimap: !prefs.minimap })} aria-label="미니맵">
          <MapIcon />
        </Button>
      </Tip>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="조작 설정">
            <Settings2 />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 p-3">
          <p className="mb-2 text-[12.5px] font-semibold">조작 설정</p>
          <div className="flex flex-col gap-2.5 text-[12.5px]">
            <div className="flex flex-col gap-1.5">
              <span className="text-fg-3">마우스 휠·트랙패드</span>
              <div className="grid grid-cols-2 gap-1.5">
                {(
                  [
                    ["pan", "이동 (Figma식)", "⌘/Ctrl+휠·핀치로 확대"],
                    ["zoom", "확대 (노드 툴식)", "빈 곳을 끌어 이동"],
                  ] as const
                ).map(([v, label, hint]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => onPrefs({ wheel: v })}
                    className={cn("flex flex-col gap-0.5 rounded-xl border p-2 text-left transition", prefs.wheel === v ? "border-fg bg-panel-2" : "border-line-2 hover:border-line-3")}
                  >
                    <span className="text-[12px] font-medium">{label}</span>
                    <span className="text-[10.5px] text-fg-4">{hint}</span>
                  </button>
                ))}
              </div>
            </div>
            <label className="flex items-center justify-between">
              <span>
                격자에 맞춰 놓기
                <span className="block text-[11px] text-fg-4">끄면 다른 노드에 맞춰 붙는 가이드가 떠요</span>
              </span>
              <Switch checked={prefs.snap} onCheckedChange={(v) => onPrefs({ snap: v })} />
            </label>
            <button type="button" onClick={onHelp} className="flex items-center gap-1.5 self-start text-[12px] text-fg-3 hover:text-fg">
              <Keyboard className="size-3.5" /> 단축키 보기
            </button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function Outline({ nodes, label, onFocus, onClose }: { nodes: Node[]; label: (id: string) => string; onFocus: (n: Node) => void; onClose: () => void }) {
  const describe = (n: Node): string => {
    const d = n.data as Record<string, unknown>;
    if (n.type === "prompt" || n.type === "note") return String(d.text ?? "").slice(0, 60) || "(비어 있음)";
    if (n.type === "list") {
      const l = d as ListData;
      return l.mode === "image" ? `이미지 ${(l.assets ?? []).length}장` : `${(l.items ?? []).filter((t) => t.trim()).length}개 항목`;
    }
    if (n.type === "imageGen" || n.type === "videoGen") return getModel(String(d.modelId))?.name ?? "";
    if (n.type === "results") return "연결한 생성 노드의 결과";
    const a = (d as AssetInputData).asset;
    return a?.filename ?? "(비어 있음)";
  };
  return (
    <div className="glass absolute right-3 top-[68px] z-20 flex max-h-[calc(100%-150px)] w-72 flex-col overflow-hidden rounded-2xl shadow-[var(--shadow-soft)]">
      <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
        <span className="text-[12.5px] font-semibold">노드 목록 · {nodes.length}</span>
        <button type="button" onClick={onClose} className="text-[11.5px] text-fg-4 hover:text-fg">
          닫기
        </button>
      </div>
      <ol className="flex flex-col overflow-y-auto p-1.5 scrollbar-thin">
        {nodes.map((n) => {
          const d = n.data as GenData;
          const running = ["pending", "queued", "in_progress", "finalizing"].includes(String(d.status ?? ""));
          return (
            <li key={n.id}>
              <button type="button" onClick={() => onFocus(n)} className={cn("flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-panel-3", n.selected && "bg-panel-2")}>
                <span
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    running ? "animate-pulse bg-warning" : d.status === "completed" ? "bg-success" : d.status === "failed" ? "bg-danger" : "bg-line-3",
                  )}
                />
                <span className="w-20 shrink-0 truncate text-[11px] text-fg-4">{label(n.id)}</span>
                <span className="min-w-0 flex-1 truncate text-[12px]">{describe(n)}</span>
              </button>
            </li>
          );
        })}
        {!nodes.length && <p className="px-2 py-4 text-center text-[12px] text-fg-4">노드가 없어요</p>}
      </ol>
    </div>
  );
}

const SHORTCUTS: [string, string][] = [
  ["더블클릭 · /", "노드 빠르게 추가"],
  ["포트를 끌어 빈 곳에 놓기", "이어 붙일 노드 추천"],
  ["V · H", "선택 · 화면 이동 도구"],
  ["Space + 끌기", "잠깐 화면 이동"],
  ["P · L · E", "펜 · 레이저 포인터 · 지우개"],
  ["⌘Z · ⇧⌘Z", "되돌리기 · 다시 하기"],
  ["⌘C · ⌘V · ⌘D", "복사 · 붙여넣기(커서 위치) · 복제"],
  ["⌘A", "모두 선택"],
  ["방향키 (⇧)", "선택한 노드 1px(10px) 이동"],
  ["⇧1 · ⇧2", "전체 보기 · 선택한 노드 보기"],
  ["⌘+ · ⌘- · ⌘0", "확대 · 축소 · 100%"],
  ["⌫", "선택 삭제"],
];

function ShortcutHelp({ onClose }: { onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="glass w-[420px] rounded-2xl p-5 shadow-[var(--shadow-pop)]" onClick={(e) => e.stopPropagation()}>
        <p className="mb-3 flex items-center gap-2 text-[14px] font-semibold">
          <Keyboard className="size-4" /> 캔버스 단축키
        </p>
        <dl className="grid grid-cols-[150px_1fr] gap-x-3 gap-y-2 text-[12.5px]">
          {SHORTCUTS.map(([k, v]) => (
            <React.Fragment key={k}>
              <dt className="font-mono text-[11.5px] text-fg-2">{k}</dt>
              <dd className="text-fg-3">{v}</dd>
            </React.Fragment>
          ))}
        </dl>
      </div>
    </div>
  );
}
