import { Clapperboard, ImageIcon, ImagePlus, ListOrdered, type LucideIcon, StickyNote, Type, Video } from "lucide-react";

import type { PortType } from "./canvas-context";

export type NodeKind = "prompt" | "list" | "imageInput" | "videoInput" | "imageGen" | "videoGen" | "note";

export type PortDef = { id: string; port: PortType; label: string };

export type NodeDef = {
  type: NodeKind;
  label: string;
  desc: string;
  icon: LucideIcon;
  /** 아이콘 색 */
  tone: "text" | "image" | "video" | "note";
  make: () => Record<string, unknown>;
  style?: { width: number; height: number };
  inputs: PortDef[];
  outputs: (data: Record<string, unknown>) => PortDef[];
  /** 검색어 */
  keywords: string;
};

export const NODE_DEFS: NodeDef[] = [
  {
    type: "prompt",
    label: "프롬프트",
    desc: "장면 설명 글",
    icon: Type,
    tone: "text",
    make: () => ({ text: "" }),
    inputs: [],
    outputs: () => [{ id: "text", port: "text", label: "텍스트" }],
    keywords: "prompt text 프롬프트 글 텍스트",
  },
  {
    type: "list",
    label: "반복 입력",
    desc: "줄마다·장마다 한 번씩 돌려 한 번에 여러 컷",
    icon: ListOrdered,
    tone: "text",
    make: () => ({ mode: "text", items: ["", ""], assets: [] }),
    inputs: [],
    outputs: (d) => (d.mode === "image" ? [{ id: "image", port: "image", label: "이미지 목록" }] : [{ id: "text", port: "text", label: "텍스트 목록" }]),
    keywords: "list batch iterate 반복 리스트 목록 배치 여러개 변형 variation",
  },
  {
    type: "imageInput",
    label: "이미지",
    desc: "라이브러리·업로드 이미지",
    icon: ImageIcon,
    tone: "image",
    make: () => ({}),
    inputs: [],
    outputs: () => [{ id: "image", port: "image", label: "이미지" }],
    keywords: "image input 이미지 사진 레퍼런스 업로드",
  },
  {
    type: "videoInput",
    label: "영상",
    desc: "라이브러리·업로드 영상",
    icon: Video,
    tone: "video",
    make: () => ({}),
    inputs: [],
    outputs: () => [{ id: "video", port: "video", label: "영상" }],
    keywords: "video input 영상 비디오 클립",
  },
  {
    type: "imageGen",
    label: "이미지 생성",
    desc: "Seedream·나노바나나·GPT Image",
    icon: ImagePlus,
    tone: "image",
    make: () => ({ modelId: "seedream-5-pro", params: {}, count: 1 }),
    inputs: [
      { id: "prompt", port: "text", label: "프롬프트" },
      { id: "refs", port: "image", label: "레퍼런스" },
    ],
    outputs: () => [{ id: "image", port: "image", label: "이미지" }],
    keywords: "image generate 이미지 생성 편집 seedream nano banana gpt",
  },
  {
    type: "videoGen",
    label: "영상 생성",
    desc: "Seedance·MiniMax H3",
    icon: Clapperboard,
    tone: "video",
    make: () => ({ modelId: "seedance-2-5", params: { draft: true }, count: 1 }),
    inputs: [
      { id: "prompt", port: "text", label: "프롬프트" },
      { id: "start", port: "image", label: "시작" },
      { id: "end", port: "image", label: "끝" },
      { id: "refs", port: "image", label: "레퍼런스" },
      { id: "videoIn", port: "video", label: "영상" },
    ],
    outputs: () => [{ id: "video", port: "video", label: "영상" }],
    keywords: "video generate 영상 생성 seedance minimax h3 i2v",
  },
  {
    type: "note",
    label: "메모",
    desc: "기획 메모·설명",
    icon: StickyNote,
    tone: "note",
    make: () => ({ text: "" }),
    style: { width: 260, height: 160 },
    inputs: [],
    outputs: () => [],
    keywords: "note memo 메모 노트 설명",
  },
];

export const NODE_DEF: Record<NodeKind, NodeDef> = Object.fromEntries(NODE_DEFS.map((d) => [d.type, d])) as Record<NodeKind, NodeDef>;

export type Suggestion = {
  key: string;
  type: NodeKind;
  label: string;
  hint: string;
  icon: LucideIcon;
  tone: NodeDef["tone"];
  /** 새 노드에 넣을 데이터 */
  data: Record<string, unknown>;
  /** 새 노드의 어느 핸들에 연결할지 */
  handle: string;
};

/** 핸들에서 선을 끌어 빈 곳에 놓았을 때 이어 붙일 노드 추천 (쓸모 있는 순서) */
export function suggestionsFor(from: { handleType: "source" | "target"; port: PortType; handleId: string }): Suggestion[] {
  const out: Suggestion[] = [];
  if (from.handleType === "source") {
    // 출력 → 이 출력을 받는 노드의 입력
    const order: [NodeKind, string, string][] =
      from.port === "text"
        ? [
            ["imageGen", "prompt", "이 글로 이미지 만들기"],
            ["videoGen", "prompt", "이 글로 영상 만들기"],
          ]
        : from.port === "image"
          ? [
              ["videoGen", "start", "이 이미지로 영상 만들기 (시작 프레임)"],
              ["imageGen", "refs", "이 이미지로 편집·변형"],
              ["videoGen", "refs", "영상 레퍼런스로 쓰기"],
              ["videoGen", "end", "끝 프레임으로 쓰기"],
            ]
          : [["videoGen", "videoIn", "이 영상 편집·연장"]];
    for (const [type, handle, hint] of order) {
      const def = NODE_DEF[type];
      out.push({ key: `${type}:${handle}`, type, label: def.label, hint, icon: def.icon, tone: def.tone, data: def.make(), handle });
    }
  } else {
    // 입력 → 그 입력에 넣을 수 있는 노드
    const order: [NodeKind, string, string, Record<string, unknown>?][] =
      from.port === "text"
        ? [
            ["prompt", "text", "프롬프트 글 연결"],
            ["list", "text", "여러 줄을 하나씩 돌려 여러 컷", { mode: "text", items: ["", "", ""], assets: [] }],
          ]
        : from.port === "image"
          ? [
              ["imageInput", "image", "라이브러리 이미지 연결"],
              ["imageGen", "image", "새로 만든 이미지 연결"],
              ["list", "image", "이미지 여러 장을 하나씩", { mode: "image", items: [], assets: [] }],
            ]
          : [
              ["videoInput", "video", "라이브러리 영상 연결"],
              ["videoGen", "video", "새로 만든 영상 연결"],
            ];
    for (const [type, handle, hint, data] of order) {
      const def = NODE_DEF[type];
      out.push({ key: `${type}:${handle}`, type, label: def.label, hint, icon: def.icon, tone: def.tone, data: data ?? def.make(), handle });
    }
  }
  return out;
}

export function searchNodes(q: string): NodeDef[] {
  const s = q.trim().toLowerCase();
  if (!s) return NODE_DEFS;
  return NODE_DEFS.filter((d) => `${d.label} ${d.desc} ${d.keywords}`.toLowerCase().includes(s));
}
