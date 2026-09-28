"use client";

import * as React from "react";

import type { LightboxItem } from "@/components/assets/lightbox";
import type { ModelStatus } from "@/components/studio/model-picker";
import type { RefAsset } from "@/components/studio/reference-slots";
import type { Flag, GenerationStatus } from "@/lib/types";

import type { ResultRun } from "./results-list";

export type PromptData = { text: string };
export type AssetInputData = { asset?: RefAsset };
export type NoteData = { text: string };
/** 반복 입력: 항목마다 한 번씩 돌려 여러 컷을 한 번에 */
export type ListData = { mode: "text" | "image"; items: string[]; assets: RefAsset[] };
/** 결과 리스트: 연결한 생성 노드의 결과가 계속 쌓여요. OK한 결과가 다음 노드로 넘어가요 */
export type ResultsData = { only?: "all" | "ok" };
export type GenData = {
  modelId: string;
  params: Record<string, unknown>;
  count?: number;
  /** 노드 자체 프롬프트 (연결된 텍스트 뒤에 붙음) */
  text?: string;
  runs?: string[];
  outputs?: RefAsset[];
  selected?: number;
  /** 다음 노드로 넘길 결과. 없으면 selected 번째 */
  pickId?: string | null;
  status?: GenerationStatus;
  error?: string | null;
};

export type CanvasCtx = {
  canvasId: string;
  meId: string;
  projectId: string;
  canEdit: boolean;
  status: Record<string, ModelStatus>;
  runNode: (id: string) => Promise<void>;
  pickAsset: (nodeId: string, kind: "image" | "video", multiple?: boolean) => void;
  openAsset: (asset: RefAsset) => void;
  /** 여러 개를 넘겨 보며 크게 보기 */
  openAssets: (items: LightboxItem[], index: number) => void;
  /** 연결된 반복 입력·결과 리스트 때문에 이 노드가 몇 번 돌아가는지 */
  fanOut: (nodeId: string) => number;
  /** 같은 종류가 여러 개일 때 붙는 번호까지 넣은 노드 이름 (예: 이미지 생성 2) */
  nodeLabel: (nodeId: string) => string;
  /** 이 생성 노드가 지금까지 만든 결과 수 (모든 실행) */
  resultCount: (nodeId: string) => number;
  /** 이 생성 노드의 결과 리스트로 가기 (없으면 만들어 연결) */
  collectResults: (nodeId: string) => void;
  /** 결과 리스트에 연결된 생성 노드들의 실행 (최신 순) */
  listRuns: (listId: string) => ResultRun[];
  /** 결과 리스트에 연결된 생성 노드 id */
  listSources: (listId: string) => string[];
  /** 더 이전 실행까지 불러오기 */
  results: { loading: boolean; hasMore: boolean; loadMore: () => void };
  /** OK·KEEP·NG (누르면 바로 보이고 저장은 뒤에서) */
  flagOf: (asset: { id: string; flag: Flag | null }) => Flag | null;
  setFlag: (assetId: string, flag: Flag | null) => void;
  /** 결과를 캔버스에 입력 노드로 꺼내기 */
  placeAsset: (asset: RefAsset, nearNodeId: string | null) => void;
};

export const CanvasContext = React.createContext<CanvasCtx | null>(null);

export function useCanvas(): CanvasCtx {
  const c = React.useContext(CanvasContext);
  if (!c) throw new Error("CanvasContext missing");
  return c;
}

/** 포트 타입별 색: 글은 흰색, 이미지는 하늘색, 영상은 보라, 결과(이미지·영상 모두)는 옅은 하늘색 */
export const PORT_COLOR = { text: "#dfe8f2", image: "#1ea7ff", video: "#a48bff", media: "#6cc8ff" } as const;
export type PortType = keyof typeof PORT_COLOR;

/** 다음 노드로 넘어가는 결과 */
export function chosenOutput(d: Pick<GenData, "outputs" | "selected" | "pickId">): RefAsset | undefined {
  return (d.pickId ? d.outputs?.find((o) => o.id === d.pickId) : undefined) ?? d.outputs?.[d.selected ?? 0];
}

/** 핸들 id → 데이터 타입 */
export function portType(nodeType: string | undefined, handle: string | null | undefined): PortType | null {
  if (!handle) return null;
  if (handle === "text" || handle === "prompt") return "text";
  if (handle === "image" || handle === "refs" || handle === "start" || handle === "end") return "image";
  if (handle === "video" || handle === "videoIn") return "video";
  if (handle === "collect" || handle === "ok") return "media";
  void nodeType;
  return null;
}

/**
 * 출력 → 입력으로 이을 수 있는지.
 * 결과 리스트 입력은 이미지·영상 생성 결과를 모두 받고, 결과 리스트 출력(OK한 결과)은 이미지·영상 입력에 이어져요.
 */
export function canConnect(from: PortType | null, to: PortType | null): boolean {
  if (!from || !to) return false;
  if (to === "media") return from === "image" || from === "video";
  if (from === "media") return to === "image" || to === "video";
  return from === to;
}
