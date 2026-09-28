import type { Edge, Node, NodePositionChange } from "@xyflow/react";
import * as React from "react";

import type { Stroke } from "./sketch";

/* ---------------------------- 정렬 가이드 (스마트 가이드) ---------------------------- */

export type Guides = { x: number | null; y: number | null };

const size = (n: Node) => ({ w: n.measured?.width ?? n.width ?? 0, h: n.measured?.height ?? n.height ?? 0 });

/**
 * 끌고 있는 노드를 다른 노드의 왼쪽·가운데·오른쪽(위·가운데·아래)에 맞춰 붙이고, 가이드 선 위치를 돌려줘요.
 */
export function snapToGuides(change: NodePositionChange, nodes: Node[], threshold: number): { position: { x: number; y: number }; guides: Guides } {
  const me = nodes.find((n) => n.id === change.id);
  const pos = change.position!;
  if (!me) return { position: pos, guides: { x: null, y: null } };
  const { w, h } = size(me);
  const xs = [pos.x, pos.x + w / 2, pos.x + w];
  const ys = [pos.y, pos.y + h / 2, pos.y + h];
  let best = { dx: Infinity, x: null as number | null, dy: Infinity, y: null as number | null };
  for (const o of nodes) {
    if (o.id === me.id || o.selected) continue;
    const s = size(o);
    const ox = [o.position.x, o.position.x + s.w / 2, o.position.x + s.w];
    const oy = [o.position.y, o.position.y + s.h / 2, o.position.y + s.h];
    xs.forEach((x, i) =>
      ox.forEach((t, j) => {
        // 가운데는 가운데끼리만
        if ((i === 1) !== (j === 1)) return;
        const d = t - x;
        if (Math.abs(d) < threshold && Math.abs(d) < Math.abs(best.dx)) best = { ...best, dx: d, x: t };
      }),
    );
    ys.forEach((y, i) =>
      oy.forEach((t, j) => {
        if ((i === 1) !== (j === 1)) return;
        const d = t - y;
        if (Math.abs(d) < threshold && Math.abs(d) < Math.abs(best.dy)) best = { ...best, dy: d, y: t };
      }),
    );
  }
  return {
    position: { x: pos.x + (best.x !== null ? best.dx : 0), y: pos.y + (best.y !== null ? best.dy : 0) },
    guides: { x: best.x, y: best.y },
  };
}

/* ---------------------------------- 되돌리기 ---------------------------------- */

/** 실행 결과처럼 되돌리면 안 되는 값은 기록에서 뺌 */
const RUNTIME = ["runs", "status", "outputs", "error", "selected", "pickId"];

export type Snapshot = { nodes: Node[]; edges: Edge[]; sketch: Stroke[] };

function strip(nodes: Node[], edges: Edge[], sketch: Stroke[]): Snapshot {
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
      data: Object.fromEntries(Object.entries(n.data ?? {}).filter(([k]) => !RUNTIME.includes(k))),
      ...(n.style ? { style: n.style } : {}),
      ...(n.width ? { width: n.width } : {}),
      ...(n.height ? { height: n.height } : {}),
    })),
    edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle, targetHandle: e.targetHandle, style: e.style })),
    sketch,
  };
}

/**
 * 캔버스 되돌리기·다시 하기. 변경이 잠시 멈추면 한 단계로 기록해요(끌기·타이핑이 여러 단계로 쪼개지지 않게).
 */
export function useCanvasHistory(nodes: Node[], edges: Edge[], sketch: Stroke[], restore: (s: Snapshot) => void) {
  const past = React.useRef<string[]>([]);
  const future = React.useRef<string[]>([]);
  const last = React.useRef<string | null>(null);
  // 버튼 활성화용 (렌더 중에는 ref를 읽지 않음)
  const [counts, setCounts] = React.useState({ past: 0, future: 0 });
  const sync = React.useCallback(() => setCounts({ past: past.current.length, future: future.current.length }), []);

  React.useEffect(() => {
    const t = setTimeout(() => {
      const snap = JSON.stringify(strip(nodes, edges, sketch));
      if (snap === last.current) return;
      if (last.current !== null) {
        past.current.push(last.current);
        if (past.current.length > 80) past.current.shift();
        future.current = [];
      }
      last.current = snap;
      sync();
    }, 450);
    return () => clearTimeout(t);
  }, [nodes, edges, sketch, sync]);

  const undo = React.useCallback(() => {
    const prev = past.current.pop();
    if (!prev || last.current === null) return false;
    future.current.push(last.current);
    last.current = prev;
    restore(JSON.parse(prev) as Snapshot);
    sync();
    return true;
  }, [restore, sync]);

  const redo = React.useCallback(() => {
    const next = future.current.pop();
    if (!next || last.current === null) return false;
    past.current.push(last.current);
    last.current = next;
    restore(JSON.parse(next) as Snapshot);
    sync();
    return true;
  }, [restore, sync]);

  return { undo, redo, canUndo: counts.past > 0, canRedo: counts.future > 0 };
}

/** 되돌릴 때 실행 결과(상태·결과물)는 지금 값을 유지 */
export function mergeRuntime(snapNodes: Node[], current: Node[]): Node[] {
  const byId = new Map(current.map((n) => [n.id, n]));
  return snapNodes.map((n) => {
    const cur = byId.get(n.id);
    if (!cur) return n;
    const keep = Object.fromEntries(Object.entries(cur.data ?? {}).filter(([k]) => RUNTIME.includes(k)));
    return { ...n, data: { ...n.data, ...keep } };
  });
}

/* ---------------------------------- 복사·붙여넣기 ---------------------------------- */

const CLIP_KEY = "zipup-canvas-clipboard";

export function copyToClipboard(nodes: Node[], edges: Edge[]): number {
  const picked = nodes.filter((n) => n.selected);
  if (!picked.length) return 0;
  const ids = new Set(picked.map((n) => n.id));
  const data = {
    nodes: picked.map((n) => ({
      id: n.id,
      type: n.type,
      position: n.position,
      data: Object.fromEntries(Object.entries(n.data ?? {}).filter(([k]) => !["runs", "status", "error"].includes(k))),
      style: n.style,
    })),
    edges: edges.filter((e) => ids.has(e.source) && ids.has(e.target)),
  };
  try {
    localStorage.setItem(CLIP_KEY, JSON.stringify(data));
  } catch {}
  return picked.length;
}

export function readClipboard(): { nodes: Node[]; edges: Edge[] } | null {
  try {
    const raw = localStorage.getItem(CLIP_KEY);
    return raw ? (JSON.parse(raw) as { nodes: Node[]; edges: Edge[] }) : null;
  } catch {
    return null;
  }
}

/** 새 id로 바꿔 붙여넣기 (연결도 함께) */
export function cloneGraph(nodes: Node[], edges: Edge[], offset: { x: number; y: number }, newId: (type?: string) => string): { nodes: Node[]; edges: Edge[] } {
  const map = new Map<string, string>();
  const outNodes = nodes.map((n) => {
    const id = newId(n.type);
    map.set(n.id, id);
    return { ...n, id, position: { x: n.position.x + offset.x, y: n.position.y + offset.y }, selected: true, data: structuredClone(n.data) };
  });
  const outEdges = edges
    .filter((e) => map.has(e.source) && map.has(e.target))
    .map((e) => ({ ...e, id: `e-${newId()}`, source: map.get(e.source)!, target: map.get(e.target)!, selected: false }));
  return { nodes: outNodes, edges: outEdges };
}
