import type { AssetKind } from "@/lib/types";

export type ProviderKey = "higgsfield" | "fal";

export type ParamOption = { value: string; label: string; hint?: string };

type ParamBase = {
  key: string;
  label: string;
  hint?: string;
  /** 고급 설정 영역에 표시 */
  advanced?: boolean;
  /** 현재 파라미터 기준으로 숨길지 여부 */
  hidden?: (params: Record<string, unknown>) => boolean;
};

export type SelectParam = ParamBase & {
  type: "select";
  options: ParamOption[];
  default: string;
  ui?: "segmented" | "ratio" | "dropdown";
};

export type NumberParam = ParamBase & {
  type: "number";
  min: number;
  max: number;
  step?: number;
  default: number;
  unit?: string;
  presets?: number[];
};

export type BooleanParam = ParamBase & {
  type: "boolean";
  default: boolean;
};

export type SeedParam = ParamBase & { type: "seed" };

export type ParamDef = SelectParam | NumberParam | BooleanParam | SeedParam;

export type InputSlots = {
  /** 이미지 레퍼런스 (편집 대상 포함) */
  images?: { max: number; label: string; hint?: string };
  startFrame?: { label: string; required?: boolean };
  endFrame?: { label: string };
  videos?: { max: number; min?: number; label: string; hint?: string };
  audios?: { max: number; label: string };
};

export type ResolvedUrls = {
  images: string[];
  startFrame?: string;
  endFrame?: string;
  videos: string[];
  audios: string[];
};

export type BuildContext = {
  prompt: string;
  params: Record<string, unknown>;
  urls: ResolvedUrls;
  /** 한 요청에서 만들 결과 수 (네이티브 배치 지원 모델만) */
  count: number;
};

export type BuiltRequest = {
  endpoint: string;
  workflow: string;
  body: Record<string, unknown>;
  expectedOutputs: number;
};

export type EstimateContext = {
  params: Record<string, unknown>;
  count: number;
  refImages: number;
  hasStartFrame: boolean;
  refVideos: number;
  /** 편집·연장 시 입력 영상 길이(초) */
  inputVideoSeconds: number;
  now: Date;
};

export type PriceItem = {
  key: string;
  label: string;
  usd: number;
  unit: string;
};

export type ModelDef = {
  id: string;
  name: string;
  shortName: string;
  vendor: string;
  kind: AssetKind;
  provider: ProviderKey;
  /** 한 줄 소개 */
  tagline: string;
  highlights: string[];
  badge?: string;
  /** 카드 배경용 그라디언트 */
  gradient: string;
  params: ParamDef[];
  inputsFor: (params: Record<string, unknown>) => InputSlots;
  count: { max: number; native: boolean };
  prices: PriceItem[];
  build: (ctx: BuildContext) => BuiltRequest;
  /** 요청 1건의 예상 비용 (USD) */
  estimate: (ctx: EstimateContext, prices: Record<string, number>) => number;
  validate?: (ctx: {
    prompt: string;
    params: Record<string, unknown>;
    refImages: number;
    hasStartFrame: boolean;
    refVideos: number;
    refAudios: number;
  }) => string | null;
  /** 가격 안내 문구 */
  priceNote?: string;
  supportsDraft?: boolean;
};
