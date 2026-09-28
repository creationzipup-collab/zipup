"use client";

import * as React from "react";

import type { ModelStatus } from "@/components/studio/model-picker";
import type { RefAsset } from "@/components/studio/reference-slots";
import type { GenerationStatus } from "@/lib/types";

export type PromptData = { text: string };
export type AssetInputData = { asset?: RefAsset };
export type NoteData = { text: string };
/** 리스트: 항목마다 한 번씩 돌려 여러 컷을 한 번에 */
export type ListData = { mode: "text" | "image"; items: string[]; assets: RefAsset[] };
export type GenData = {
  modelId: string;
  params: Record<string, unknown>;
  count?: number;
  /** 노드 자체 프롬프트 (연결된 텍스트 뒤에 붙음) */
  text?: string;
  runs?: string[];
  outputs?: RefAsset[];
  selected?: number;
  status?: GenerationStatus;
  error?: string | null;
};

export type CanvasCtx = {
  canvasId: string;
  projectId: string;
  canEdit: boolean;
  status: Record<string, ModelStatus>;
  runNode: (id: string) => Promise<void>;
  pickAsset: (nodeId: string, kind: "image" | "video", multiple?: boolean) => void;
  openAsset: (asset: RefAsset) => void;
  /** 연결된 리스트 때문에 이 노드가 몇 번 돌아가는지 */
  fanOut: (nodeId: string) => number;
};

export const CanvasContext = React.createContext<CanvasCtx | null>(null);

export function useCanvas(): CanvasCtx {
  const c = React.useContext(CanvasContext);
  if (!c) throw new Error("CanvasContext missing");
  return c;
}

/** 포트 타입별 색 */
export const PORT_COLOR = { text: "#f4f4f5", image: "#ff5b24", video: "#4c8dff" } as const;
export type PortType = keyof typeof PORT_COLOR;

/** 핸들 id → 데이터 타입 */
export function portType(nodeType: string | undefined, handle: string | null | undefined): PortType | null {
  if (!handle) return null;
  if (handle === "text" || handle === "prompt") return "text";
  if (handle === "image" || handle === "refs" || handle === "start" || handle === "end") return "image";
  if (handle === "video" || handle === "videoIn") return "video";
  void nodeType;
  return null;
}
