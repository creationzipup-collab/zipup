"use client";

import * as React from "react";

import type { ModelStatus } from "@/components/studio/model-picker";
import type { RefAsset } from "@/components/studio/reference-slots";
import type { GenerationStatus } from "@/lib/types";

export type PromptData = { text: string };
export type AssetInputData = { asset?: RefAsset };
export type NoteData = { text: string };
/** 반복 입력: 항목마다 한 번씩 돌려 여러 컷을 한 번에 */
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
  /** 다음 노드로 넘길 결과 (결과 모음에서 고른 것). 없으면 selected 번째 */
  pickId?: string | null;
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
  /** 연결된 반복 입력 때문에 이 노드가 몇 번 돌아가는지 */
  fanOut: (nodeId: string) => number;
  /** 같은 종류가 여러 개일 때 붙는 번호까지 넣은 노드 이름 (예: 이미지 생성 2) */
  nodeLabel: (nodeId: string) => string;
  /** 이 노드가 지금까지 만든 결과 수 (모든 실행) */
  resultCount: (nodeId: string) => number;
  /** 결과 모음을 이 노드 것만 보이게 열기 */
  openResults: (nodeId: string) => void;
};

export const CanvasContext = React.createContext<CanvasCtx | null>(null);

export function useCanvas(): CanvasCtx {
  const c = React.useContext(CanvasContext);
  if (!c) throw new Error("CanvasContext missing");
  return c;
}

/** 포트 타입별 색: 글은 흰색, 이미지는 하늘색, 영상은 보라 */
export const PORT_COLOR = { text: "#dfe8f2", image: "#1ea7ff", video: "#a48bff" } as const;
export type PortType = keyof typeof PORT_COLOR;

/** 핸들 id → 데이터 타입 */
/** 다음 노드로 넘어가는 결과 */
export function chosenOutput(d: Pick<GenData, "outputs" | "selected" | "pickId">): RefAsset | undefined {
  return (d.pickId ? d.outputs?.find((o) => o.id === d.pickId) : undefined) ?? d.outputs?.[d.selected ?? 0];
}

export function portType(nodeType: string | undefined, handle: string | null | undefined): PortType | null {
  if (!handle) return null;
  if (handle === "text" || handle === "prompt") return "text";
  if (handle === "image" || handle === "refs" || handle === "start" || handle === "end") return "image";
  if (handle === "video" || handle === "videoIn") return "video";
  void nodeType;
  return null;
}
