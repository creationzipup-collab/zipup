import type {
  BuildContext,
  EstimateContext,
  ModelDef,
  ParamOption,
  PriceItem,
} from "./types";

/* -------------------------------------------------------------------------- */
/*                                  Helpers                                   */
/* -------------------------------------------------------------------------- */

const RATIO_HINT: Record<string, string> = {
  auto: "자동",
  "1:1": "정사각",
  "4:5": "인스타 세로",
  "5:4": "가로",
  "3:4": "세로",
  "4:3": "가로",
  "2:3": "세로",
  "3:2": "가로",
  "9:16": "쇼츠·릴스",
  "16:9": "와이드",
  "21:9": "시네마",
  "4:1": "배너",
  "1:4": "세로 배너",
  "8:1": "초광폭",
  "1:8": "초장폭",
  adaptive: "입력 맞춤",
};

function ratios(values: string[]): ParamOption[] {
  return values.map((v) => ({
    value: v,
    label: v === "auto" ? "자동" : v === "adaptive" ? "맞춤" : v,
    hint: RATIO_HINT[v],
  }));
}

function str(v: unknown, fallback: string): string {
  return typeof v === "string" && v !== "" ? v : fallback;
}

function num(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

function seedOf(v: unknown): number | undefined {
  const n = num(v, NaN);
  return Number.isInteger(n) && n >= 0 ? n : undefined;
}

function price(prices: Record<string, number>, key: string, items: PriceItem[]): number {
  if (prices[key] !== undefined) return prices[key];
  return items.find((p) => p.key === key)?.usd ?? 0;
}

/** 가격 프로모션: 해당 시각 이전이면 배수 적용 */
function promo(now: Date, until: string, multiplier: number): number {
  return now.getTime() < new Date(until).getTime() ? multiplier : 1;
}

/** 비율 + 목표 면적으로 픽셀 크기 계산 (16의 배수) */
export function sizeForRatio(ratio: string, area: number): { width: number; height: number } {
  const [rw, rh] = ratio.split(":").map(Number);
  if (!rw || !rh) return { width: Math.round(Math.sqrt(area)), height: Math.round(Math.sqrt(area)) };
  const width = Math.floor(Math.sqrt((area * rw) / rh) / 16) * 16;
  const height = Math.floor(Math.sqrt((area * rh) / rw) / 16) * 16;
  return { width, height };
}

/* -------------------------------------------------------------------------- */
/*                               Image models                                 */
/* -------------------------------------------------------------------------- */

const SEEDREAM_PRICES: PriceItem[] = [
  { key: "tier1", label: "1.5K 이하 (장당)", usd: 0.0675, unit: "image" },
  { key: "tier2", label: "2K (장당)", usd: 0.135, unit: "image" },
  { key: "extraRef", label: "추가 레퍼런스 (장당)", usd: 0.0045, unit: "image" },
];

const seedream5Pro: ModelDef = {
  id: "seedream-5-pro",
  name: "Seedream 5.0 Pro",
  shortName: "Seedream 5 Pro",
  vendor: "ByteDance",
  kind: "image",
  provider: "fal",
  tagline: "딥싱킹 기반 고정밀 생성 · 14개 언어 텍스트 · 부분 편집",
  highlights: ["복잡한 인포그래픽·타이포", "한 문장으로 부분 편집", "레퍼런스 최대 10장"],
  badge: "PRO",
  gradient: "linear-gradient(135deg,#1b2a4a 0%,#3a6ea5 55%,#b9e2ff 100%)",
  params: [
    {
      key: "aspectRatio",
      label: "비율",
      type: "select",
      ui: "ratio",
      default: "1:1",
      options: ratios(["auto", "1:1", "4:5", "3:4", "2:3", "9:16", "16:9", "3:2", "4:3", "21:9"]),
    },
    {
      key: "resolution",
      label: "해상도",
      type: "select",
      ui: "segmented",
      default: "2K",
      options: [
        { value: "1.5K", label: "1.5K", hint: "$0.068" },
        { value: "2K", label: "2K", hint: "$0.135" },
      ],
    },
    {
      key: "outputFormat",
      label: "파일 형식",
      type: "select",
      ui: "segmented",
      default: "png",
      advanced: true,
      options: [
        { value: "png", label: "PNG" },
        { value: "jpeg", label: "JPG" },
      ],
    },
  ],
  inputsFor: () => ({
    images: { max: 10, label: "레퍼런스 / 편집 이미지", hint: "이미지를 넣으면 편집 모드로 동작해요" },
  }),
  count: { max: 4, native: true },
  prices: SEEDREAM_PRICES,
  build: (ctx: BuildContext) => {
    const ratio = str(ctx.params.aspectRatio, "1:1");
    const tier = str(ctx.params.resolution, "2K");
    const area = tier === "2K" ? 2048 * 2048 : 1536 * 1536;
    const imageSize =
      ratio === "auto" ? (tier === "2K" ? "auto_2K" : "auto_1K") : sizeForRatio(ratio, area);
    const edit = ctx.urls.images.length > 0;
    const body: Record<string, unknown> = {
      prompt: ctx.prompt,
      image_size: imageSize,
      num_images: ctx.count,
      output_format: str(ctx.params.outputFormat, "png"),
      enable_safety_checker: true,
    };
    if (edit) body.image_urls = ctx.urls.images.slice(0, 10);
    return {
      endpoint: edit ? "bytedance/seedream/v5/pro/edit" : "bytedance/seedream/v5/pro/text-to-image",
      workflow: edit ? "edit" : "text-to-image",
      body,
      expectedOutputs: ctx.count,
    };
  },
  estimate: (ctx: EstimateContext, prices) => {
    const tier = str(ctx.params.resolution, "2K");
    const base = tier === "2K" ? price(prices, "tier2", SEEDREAM_PRICES) : price(prices, "tier1", SEEDREAM_PRICES);
    const extra = Math.max(0, ctx.refImages - 1) * price(prices, "extraRef", SEEDREAM_PRICES);
    return (base + extra) * ctx.count;
  },
  validate: ({ prompt }) => (prompt.trim() ? null : "프롬프트를 입력해 주세요."),
};

const NB_PRO_PRICES: PriceItem[] = [
  { key: "base", label: "1K·2K (장당)", usd: 0.15, unit: "image" },
  { key: "4k", label: "4K (장당)", usd: 0.3, unit: "image" },
  { key: "webSearch", label: "웹 검색 (요청당)", usd: 0.015, unit: "request" },
];

const nanoBananaPro: ModelDef = {
  id: "nano-banana-pro",
  name: "Nano Banana Pro",
  shortName: "Nano Banana Pro",
  vendor: "Google",
  kind: "image",
  provider: "fal",
  tagline: "Gemini 3 Pro Image · 캐릭터 일관성 · 정확한 텍스트",
  highlights: ["캐릭터·제품 일관성", "레퍼런스 최대 14장 합성", "4K 출력"],
  badge: "PRO",
  gradient: "linear-gradient(135deg,#3d2a00 0%,#d99a00 50%,#fff1a8 100%)",
  params: [
    {
      key: "aspectRatio",
      label: "비율",
      type: "select",
      ui: "ratio",
      default: "1:1",
      options: ratios(["auto", "1:1", "4:5", "3:4", "2:3", "9:16", "16:9", "3:2", "4:3", "5:4", "21:9"]),
    },
    {
      key: "resolution",
      label: "해상도",
      type: "select",
      ui: "segmented",
      default: "2K",
      options: [
        { value: "1K", label: "1K" },
        { value: "2K", label: "2K" },
        { value: "4K", label: "4K", hint: "2배 가격" },
      ],
    },
    { key: "webSearch", label: "웹 검색 반영", type: "boolean", default: false, advanced: true, hint: "최신 정보를 참고해 생성 (+$0.015)" },
    { key: "seed", label: "시드", type: "seed", advanced: true },
  ],
  inputsFor: () => ({ images: { max: 14, label: "레퍼런스 / 편집 이미지", hint: "여러 장을 합성하거나 편집할 수 있어요" } }),
  count: { max: 4, native: true },
  prices: NB_PRO_PRICES,
  build: (ctx) => {
    const edit = ctx.urls.images.length > 0;
    const body: Record<string, unknown> = {
      prompt: ctx.prompt,
      aspect_ratio: str(ctx.params.aspectRatio, "1:1"),
      resolution: str(ctx.params.resolution, "2K"),
      num_images: ctx.count,
      output_format: "png",
      enable_web_search: bool(ctx.params.webSearch, false),
    };
    const seed = seedOf(ctx.params.seed);
    if (seed !== undefined) body.seed = seed;
    if (edit) body.image_urls = ctx.urls.images.slice(0, 14);
    return {
      endpoint: edit ? "fal-ai/nano-banana-pro/edit" : "fal-ai/nano-banana-pro",
      workflow: edit ? "edit" : "text-to-image",
      body,
      expectedOutputs: ctx.count,
    };
  },
  estimate: (ctx, prices) => {
    const res = str(ctx.params.resolution, "2K");
    const per = res === "4K" ? price(prices, "4k", NB_PRO_PRICES) : price(prices, "base", NB_PRO_PRICES);
    const search = bool(ctx.params.webSearch, false) ? price(prices, "webSearch", NB_PRO_PRICES) : 0;
    return per * ctx.count + search;
  },
  validate: ({ prompt }) => (prompt.trim() ? null : "프롬프트를 입력해 주세요."),
};

const NB2_PRICES: PriceItem[] = [
  { key: "base", label: "1K (장당)", usd: 0.08, unit: "image" },
  { key: "webSearch", label: "웹 검색 (요청당)", usd: 0.015, unit: "request" },
  { key: "highThinking", label: "High thinking (요청당)", usd: 0.002, unit: "request" },
];
const NB2_RES_MULT: Record<string, number> = { "0.5K": 0.75, "1K": 1, "2K": 1.5, "4K": 2 };

const nanoBanana2: ModelDef = {
  id: "nano-banana-2",
  name: "Nano Banana 2",
  shortName: "Nano Banana 2",
  vendor: "Google",
  kind: "image",
  provider: "fal",
  tagline: "Gemini 3.1 Flash Image · 빠르고 선명한 반복 작업",
  highlights: ["빠른 속도·합리적 가격", "초광폭 비율(8:1) 지원", "레퍼런스 최대 14장"],
  badge: "FAST",
  gradient: "linear-gradient(135deg,#2a1d00 0%,#f0b400 45%,#ffe066 100%)",
  params: [
    {
      key: "aspectRatio",
      label: "비율",
      type: "select",
      ui: "ratio",
      default: "1:1",
      options: ratios(["auto", "1:1", "4:5", "3:4", "2:3", "9:16", "16:9", "3:2", "4:3", "5:4", "21:9", "4:1", "1:4", "8:1", "1:8"]),
    },
    {
      key: "resolution",
      label: "해상도",
      type: "select",
      ui: "segmented",
      default: "1K",
      options: [
        { value: "0.5K", label: "0.5K" },
        { value: "1K", label: "1K" },
        { value: "2K", label: "2K" },
        { value: "4K", label: "4K" },
      ],
    },
    {
      key: "thinking",
      label: "사고 수준",
      type: "select",
      ui: "segmented",
      default: "off",
      advanced: true,
      options: [
        { value: "off", label: "끄기" },
        { value: "minimal", label: "최소" },
        { value: "high", label: "높음" },
      ],
    },
    { key: "webSearch", label: "웹 검색 반영", type: "boolean", default: false, advanced: true, hint: "+$0.015" },
    { key: "seed", label: "시드", type: "seed", advanced: true },
  ],
  inputsFor: () => ({ images: { max: 14, label: "레퍼런스 / 편집 이미지" } }),
  count: { max: 4, native: true },
  prices: NB2_PRICES,
  build: (ctx) => {
    const edit = ctx.urls.images.length > 0;
    const body: Record<string, unknown> = {
      prompt: ctx.prompt,
      aspect_ratio: str(ctx.params.aspectRatio, "1:1"),
      resolution: str(ctx.params.resolution, "1K"),
      num_images: ctx.count,
      output_format: "png",
      enable_web_search: bool(ctx.params.webSearch, false),
    };
    const thinking = str(ctx.params.thinking, "off");
    if (thinking !== "off") body.thinking_level = thinking;
    const seed = seedOf(ctx.params.seed);
    if (seed !== undefined) body.seed = seed;
    if (edit) body.image_urls = ctx.urls.images.slice(0, 14);
    return {
      endpoint: edit ? "fal-ai/nano-banana-2/edit" : "fal-ai/nano-banana-2",
      workflow: edit ? "edit" : "text-to-image",
      body,
      expectedOutputs: ctx.count,
    };
  },
  estimate: (ctx, prices) => {
    const mult = NB2_RES_MULT[str(ctx.params.resolution, "1K")] ?? 1;
    let total = price(prices, "base", NB2_PRICES) * mult * ctx.count;
    if (bool(ctx.params.webSearch, false)) total += price(prices, "webSearch", NB2_PRICES);
    if (str(ctx.params.thinking, "off") === "high") total += price(prices, "highThinking", NB2_PRICES);
    return total;
  },
  validate: ({ prompt }) => (prompt.trim() ? null : "프롬프트를 입력해 주세요."),
};

/** GPT Image 2.5 대략 단가 (Higgsfield 견적 API를 우선 사용, 실패 시 이 표로 추정) */
const GPT25_TABLE: Record<string, Record<string, number>> = {
  low: { "1k": 0.02, "2k": 0.03, "4k": 0.08 },
  medium: { "1k": 0.05, "2k": 0.07, "4k": 0.18 },
  high: { "1k": 0.13, "2k": 0.18, "4k": 0.45 },
  xhigh: { "1k": 0.25, "2k": 0.35, "4k": 0.8 },
  max: { "1k": 0.45, "2k": 0.6, "4k": 1.2 },
};
const GPT25_PRICES: PriceItem[] = [
  { key: "multiplier", label: "추정 단가 배수", usd: 1, unit: "x" },
  { key: "sunburstMultiplier", label: "Sunburst 배수", usd: 1.5, unit: "x" },
];

const gptImage25: ModelDef = {
  id: "gpt-image-2-5",
  name: "GPT Image 2.5",
  shortName: "GPT Image 2.5",
  vendor: "OpenAI",
  kind: "image",
  provider: "higgsfield",
  tagline: "OpenAI 최신 이미지 모델 · Flare(빠름) / Sunburst(정밀 편집)",
  highlights: ["레퍼런스 최대 16장", "요청한 부분만 정확히 편집", "4K · 품질 5단계"],
  badge: "NEW",
  gradient: "linear-gradient(135deg,#0d1f17 0%,#10a37f 50%,#bff5e4 100%)",
  params: [
    {
      key: "variant",
      label: "버전",
      type: "select",
      ui: "segmented",
      default: "flare",
      options: [
        { value: "flare", label: "Flare", hint: "빠르고 선명" },
        { value: "sunburst", label: "Sunburst", hint: "정밀 편집" },
      ],
    },
    {
      key: "aspectRatio",
      label: "비율",
      type: "select",
      ui: "ratio",
      default: "1:1",
      options: ratios(["auto", "1:1", "2:3", "3:4", "9:16", "16:9", "3:2", "4:3", "21:9"]),
    },
    {
      key: "resolution",
      label: "해상도",
      type: "select",
      ui: "segmented",
      default: "2k",
      options: [
        { value: "1k", label: "1K" },
        { value: "2k", label: "2K" },
        { value: "4k", label: "4K" },
      ],
    },
    {
      key: "quality",
      label: "품질",
      type: "select",
      ui: "segmented",
      default: "high",
      options: [
        { value: "low", label: "낮음" },
        { value: "medium", label: "보통" },
        { value: "high", label: "높음" },
        { value: "xhigh", label: "매우 높음" },
        { value: "max", label: "최고" },
      ],
    },
  ],
  inputsFor: () => ({ images: { max: 16, label: "레퍼런스 / 편집 이미지", hint: "넣으면 편집 모드" } }),
  count: { max: 4, native: false },
  prices: GPT25_PRICES,
  priceNote: "토큰 기반 과금 — 제출 전 Higgsfield 견적 API로 정확히 계산해요.",
  build: (ctx) => {
    const variant = str(ctx.params.variant, "flare") === "sunburst" ? "sunburst" : "flare";
    const body: Record<string, unknown> = {
      prompt: ctx.prompt,
      aspect_ratio: str(ctx.params.aspectRatio, "1:1"),
      resolution: str(ctx.params.resolution, "2k"),
      quality: str(ctx.params.quality, "high"),
      enhance_prompt: false,
    };
    if (ctx.urls.images.length) body.image_urls = ctx.urls.images.slice(0, 16);
    return {
      endpoint: `marketing-studio/image/${variant}`,
      workflow: ctx.urls.images.length ? "edit" : "text-to-image",
      body,
      expectedOutputs: 1,
    };
  },
  estimate: (ctx, prices) => {
    const q = str(ctx.params.quality, "high");
    const r = str(ctx.params.resolution, "2k");
    let usd = GPT25_TABLE[q]?.[r] ?? 0.18;
    usd *= price(prices, "multiplier", GPT25_PRICES);
    if (str(ctx.params.variant, "flare") === "sunburst") usd *= price(prices, "sunburstMultiplier", GPT25_PRICES);
    return usd + ctx.refImages * 0.004;
  },
  validate: ({ prompt }) => (prompt.trim() ? null : "프롬프트를 입력해 주세요."),
};

const GPT2_TABLE: Record<string, Record<string, number>> = {
  low: { "1k": 0.0162, "2k": 0.0222, "4k": 0.05 },
  medium: { "1k": 0.05, "2k": 0.07, "4k": 0.2 },
  high: { "1k": 0.18, "2k": 0.25, "4k": 0.7219 },
};
const GPT2_PRICES: PriceItem[] = [{ key: "multiplier", label: "추정 단가 배수", usd: 1, unit: "x" }];

const gptImage2: ModelDef = {
  id: "gpt-image-2",
  name: "GPT Image 2.0",
  shortName: "GPT Image 2",
  vendor: "OpenAI",
  kind: "image",
  provider: "higgsfield",
  tagline: "텍스트·레이아웃에 강한 범용 모델 · 저렴한 시안 작업",
  highlights: ["장당 $0.016부터", "레퍼런스 최대 16장", "캠페인 이미지 편집"],
  gradient: "linear-gradient(135deg,#0b1210 0%,#1f6f5a 55%,#a7e8d4 100%)",
  params: [
    {
      key: "aspectRatio",
      label: "비율",
      type: "select",
      ui: "ratio",
      default: "1:1",
      options: ratios(["auto", "1:1", "2:3", "3:4", "9:16", "16:9", "3:2", "4:3", "21:9"]),
    },
    {
      key: "resolution",
      label: "해상도",
      type: "select",
      ui: "segmented",
      default: "2k",
      options: [
        { value: "1k", label: "1K" },
        { value: "2k", label: "2K" },
        { value: "4k", label: "4K" },
      ],
    },
    {
      key: "quality",
      label: "품질",
      type: "select",
      ui: "segmented",
      default: "high",
      options: [
        { value: "low", label: "낮음" },
        { value: "medium", label: "보통" },
        { value: "high", label: "높음" },
      ],
    },
  ],
  inputsFor: () => ({ images: { max: 16, label: "레퍼런스 / 편집 이미지" } }),
  count: { max: 4, native: false },
  prices: GPT2_PRICES,
  priceNote: "토큰 기반 과금 — 제출 전 Higgsfield 견적 API로 정확히 계산해요.",
  build: (ctx) => {
    const body: Record<string, unknown> = {
      prompt: ctx.prompt,
      aspect_ratio: str(ctx.params.aspectRatio, "1:1"),
      resolution: str(ctx.params.resolution, "2k"),
      quality: str(ctx.params.quality, "high"),
      enhance_prompt: false,
    };
    if (ctx.urls.images.length) body.image_urls = ctx.urls.images.slice(0, 16);
    return {
      endpoint: "marketing-studio/image",
      workflow: ctx.urls.images.length ? "edit" : "text-to-image",
      body,
      expectedOutputs: 1,
    };
  },
  estimate: (ctx, prices) => {
    const q = str(ctx.params.quality, "high");
    const r = str(ctx.params.resolution, "2k");
    return (GPT2_TABLE[q]?.[r] ?? 0.25) * price(prices, "multiplier", GPT2_PRICES);
  },
  validate: ({ prompt }) => (prompt.trim() ? null : "프롬프트를 입력해 주세요."),
};

/* -------------------------------------------------------------------------- */
/*                               Video models                                 */
/* -------------------------------------------------------------------------- */

const PROMO_UNTIL = "2026-10-01T00:00:00Z";

const H3_PRICES: PriceItem[] = [
  { key: "perSecond", label: "2K 초당", usd: 0.13, unit: "second" },
  { key: "promoMultiplier", label: "10/1 이전 할인 배수", usd: 0.7, unit: "x" },
];

const minimaxH3: ModelDef = {
  id: "minimax-h3",
  name: "MiniMax H3",
  shortName: "H3",
  vendor: "MiniMax",
  kind: "video",
  provider: "higgsfield",
  tagline: "Hailuo 3 · 2K 네이티브 오디오 · 텍스트/이미지/영상/음성 레퍼런스",
  highlights: ["2K · 24fps · 최대 15초", "대사·효과음·앰비언스 동시 생성", "얼굴·카메라·목소리 레퍼런스 조합"],
  badge: "2K",
  gradient: "linear-gradient(135deg,#1a0716 0%,#ff005b 50%,#ffb3cf 100%)",
  params: [
    {
      key: "aspectRatio",
      label: "비율",
      type: "select",
      ui: "ratio",
      default: "16:9",
      options: ratios(["16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "adaptive"]),
      hint: "시작 프레임을 넣으면 그 비율을 따라가요",
    },
    {
      key: "duration",
      label: "길이",
      type: "number",
      min: 5,
      max: 15,
      step: 1,
      default: 5,
      unit: "초",
      presets: [5, 10, 15],
    },
    { key: "watermark", label: "AIGC 워터마크", type: "boolean", default: false, advanced: true },
  ],
  inputsFor: () => ({
    startFrame: { label: "시작 프레임" },
    endFrame: { label: "끝 프레임" },
    images: { max: 9, label: "이미지 레퍼런스", hint: "얼굴·의상·배경 등 (시작 프레임과 함께 쓸 수 없어요)" },
    videos: { max: 3, label: "영상 레퍼런스", hint: "카메라 무빙·동작 참고" },
    audios: { max: 3, label: "음성 레퍼런스" },
  }),
  count: { max: 4, native: false },
  prices: H3_PRICES,
  priceNote: "2K 초당 $0.13 (10월 1일 전까지 30% 할인 $0.091)",
  build: (ctx) => {
    const duration = Math.min(15, Math.max(5, Math.round(num(ctx.params.duration, 5))));
    const aspect = str(ctx.params.aspectRatio, "16:9");
    const base: Record<string, unknown> = {
      prompt: ctx.prompt,
      duration,
      resolution: "2K",
      aspect_ratio: aspect,
      aigc_watermark: bool(ctx.params.watermark, false),
    };
    if (ctx.urls.startFrame) {
      const body = { ...base, image_url: ctx.urls.startFrame } as Record<string, unknown>;
      if (ctx.urls.endFrame) body.end_image_url = ctx.urls.endFrame;
      return { endpoint: "minimax/h3/image-to-video", workflow: "image-to-video", body, expectedOutputs: 1 };
    }
    if (ctx.urls.images.length || ctx.urls.videos.length) {
      const body = { ...base } as Record<string, unknown>;
      if (ctx.urls.images.length) body.image_urls = ctx.urls.images.slice(0, 9);
      if (ctx.urls.videos.length) body.video_urls = ctx.urls.videos.slice(0, 3);
      if (ctx.urls.audios.length) body.audio_urls = ctx.urls.audios.slice(0, 3);
      return { endpoint: "minimax/h3/reference-to-video", workflow: "reference-to-video", body, expectedOutputs: 1 };
    }
    return { endpoint: "minimax/h3/text-to-video", workflow: "text-to-video", body: base, expectedOutputs: 1 };
  },
  estimate: (ctx, prices) => {
    const duration = Math.min(15, Math.max(5, Math.round(num(ctx.params.duration, 5))));
    const m = promo(ctx.now, PROMO_UNTIL, price(prices, "promoMultiplier", H3_PRICES));
    return duration * price(prices, "perSecond", H3_PRICES) * m;
  },
  validate: ({ prompt, hasStartFrame, refImages, refVideos, refAudios }) => {
    if (!prompt.trim()) return "프롬프트를 입력해 주세요.";
    if (hasStartFrame && (refImages > 0 || refVideos > 0)) return "시작 프레임과 레퍼런스는 함께 쓸 수 없어요.";
    if (refAudios > 0 && refImages === 0 && refVideos === 0 && !hasStartFrame)
      return "음성 레퍼런스는 이미지나 영상 레퍼런스와 함께 써야 해요.";
    return null;
  },
};

const SEEDANCE_PRICES: PriceItem[] = [
  { key: "per1kTokens", label: "영상 토큰 1,000개당", usd: 0.0214, unit: "1k tokens" },
  { key: "promoMultiplier", label: "10/1 이전 할인 배수", usd: 0.7, unit: "x" },
];
/** Seedance 해상도별 픽셀 수 (16:9 기준) */
const SEEDANCE_PIXELS: Record<string, number> = { "480p": 854 * 480, "720p": 1280 * 720 };

export function seedanceTokens(resolution: string, seconds: number): number {
  const px = SEEDANCE_PIXELS[resolution] ?? SEEDANCE_PIXELS["720p"];
  return Math.ceil((px * seconds * 24) / 1024);
}

const seedance25: ModelDef = {
  id: "seedance-2-5",
  name: "Seedance 2.5",
  shortName: "Seedance 2.5",
  vendor: "ByteDance",
  kind: "video",
  provider: "higgsfield",
  tagline: "최대 30초 · 멀티모달 레퍼런스 50개 · 편집·연장 · 드래프트 모드",
  highlights: ["480p 드래프트로 싸게 여러 테이크", "고른 테이크만 720p 최종 렌더", "영상 편집·연장"],
  badge: "DRAFT",
  gradient: "linear-gradient(135deg,#050b1f 0%,#2b59ff 50%,#9fe0ff 100%)",
  supportsDraft: true,
  params: [
    {
      key: "task",
      label: "작업",
      type: "select",
      ui: "segmented",
      default: "generate",
      options: [
        { value: "generate", label: "생성" },
        { value: "edit", label: "영상 편집" },
        { value: "extend", label: "영상 연장" },
      ],
    },
    {
      key: "draft",
      label: "드래프트 모드",
      type: "boolean",
      default: false,
      hint: "480p로 저렴하게 미리보고, 마음에 드는 테이크만 720p로 최종 렌더",
    },
    {
      key: "aspectRatio",
      label: "비율",
      type: "select",
      ui: "ratio",
      default: "16:9",
      options: ratios(["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"]),
      hidden: (p) => p.task === "edit" || p.task === "extend",
    },
    {
      key: "resolution",
      label: "해상도",
      type: "select",
      ui: "segmented",
      default: "720p",
      options: [
        { value: "480p", label: "480p" },
        { value: "720p", label: "720p" },
      ],
      hidden: (p) => p.draft === true,
    },
    {
      key: "duration",
      label: "길이",
      type: "number",
      min: 4,
      max: 30,
      step: 1,
      default: 5,
      unit: "초",
      presets: [5, 8, 10, 15],
      hidden: (p) => p.task === "edit",
    },
    { key: "audio", label: "오디오 생성", type: "boolean", default: true },
    {
      key: "bitrate",
      label: "비트레이트",
      type: "select",
      ui: "segmented",
      default: "high",
      advanced: true,
      options: [
        { value: "standard", label: "표준" },
        { value: "high", label: "높음" },
      ],
    },
  ],
  inputsFor: (p) => {
    if (p.task === "edit")
      return {
        videos: { max: 10, min: 1, label: "편집할 영상 (첫 번째) + 레퍼런스", hint: "첫 번째 영상을 편집해요" },
        images: { max: 30, label: "이미지 레퍼런스" },
        audios: { max: 10, label: "오디오 레퍼런스" },
      };
    if (p.task === "extend")
      return {
        videos: { max: 10, min: 1, label: "연장할 영상 (첫 번째) + 레퍼런스" },
        images: { max: 30, label: "이미지 레퍼런스" },
        audios: { max: 10, label: "오디오 레퍼런스" },
      };
    return {
      startFrame: { label: "시작 프레임" },
      endFrame: { label: "끝 프레임" },
      images: { max: 30, label: "이미지 레퍼런스", hint: "시작 프레임과 함께 쓸 수 없어요" },
      videos: { max: 10, label: "영상 레퍼런스" },
      audios: { max: 10, label: "오디오 레퍼런스" },
    };
  },
  count: { max: 4, native: false },
  prices: SEEDANCE_PRICES,
  priceNote: "초당 480p 약 $0.21 · 720p 약 $0.46 (10월 1일 전까지 30% 할인)",
  build: (ctx) => {
    const task = str(ctx.params.task, "generate");
    const draft = bool(ctx.params.draft, false);
    const resolution = draft ? "480p" : str(ctx.params.resolution, "720p");
    const bitrate = draft ? "standard" : str(ctx.params.bitrate, "high");
    const duration = Math.min(30, Math.max(4, Math.round(num(ctx.params.duration, 5))));
    const common: Record<string, unknown> = {
      prompt: ctx.prompt,
      resolution,
      bitrate_mode: bitrate,
      generate_audio: bool(ctx.params.audio, true),
    };
    const refs = (body: Record<string, unknown>, skipFirstVideo: boolean) => {
      if (ctx.urls.images.length) body.image_urls = ctx.urls.images.slice(0, 30);
      const vids = skipFirstVideo ? ctx.urls.videos.slice(1) : ctx.urls.videos;
      if (vids.length) body.video_urls = vids.slice(0, skipFirstVideo ? 9 : 10);
      if (ctx.urls.audios.length) body.audio_urls = ctx.urls.audios.slice(0, 10);
      return body;
    };
    if (task === "edit" || task === "extend") {
      const body = refs({ ...common, video_url: ctx.urls.videos[0] }, true);
      if (task === "extend") body.duration = duration;
      return {
        endpoint: `bytedance/seedance-2.5/${task === "edit" ? "video-edit" : "video-extend"}`,
        workflow: task === "edit" ? "video-edit" : "video-extend",
        body,
        expectedOutputs: 1,
      };
    }
    if (ctx.urls.startFrame) {
      const body: Record<string, unknown> = { ...common, duration, image_url: ctx.urls.startFrame };
      if (ctx.urls.endFrame) body.end_image_url = ctx.urls.endFrame;
      if (!ctx.prompt.trim()) delete body.prompt;
      return { endpoint: "bytedance/seedance-2.5/image-to-video", workflow: "image-to-video", body, expectedOutputs: 1 };
    }
    const aspect = str(ctx.params.aspectRatio, "16:9");
    if (ctx.urls.images.length || ctx.urls.videos.length || ctx.urls.audios.length) {
      const body = refs({ ...common, duration, aspect_ratio: aspect }, false);
      return { endpoint: "bytedance/seedance-2.5/reference-to-video", workflow: "reference-to-video", body, expectedOutputs: 1 };
    }
    return {
      endpoint: "bytedance/seedance-2.5/text-to-video",
      workflow: "text-to-video",
      body: { ...common, duration, aspect_ratio: aspect, output_format: "mp4" },
      expectedOutputs: 1,
    };
  },
  estimate: (ctx, prices) => {
    const task = str(ctx.params.task, "generate");
    const draft = bool(ctx.params.draft, false);
    const resolution = draft ? "480p" : str(ctx.params.resolution, "720p");
    const duration = Math.min(30, Math.max(4, Math.round(num(ctx.params.duration, 5))));
    // 과금 토큰 = 해상도 × (입력 영상 길이 + 생성 영상 길이)
    const source = Math.max(4, ctx.inputVideoSeconds || 5);
    const billableSeconds =
      task === "edit" ? source * 2 : task === "extend" ? source + duration : duration;
    const tokens = seedanceTokens(resolution, billableSeconds);
    const m = promo(ctx.now, PROMO_UNTIL, price(prices, "promoMultiplier", SEEDANCE_PRICES));
    return (tokens / 1000) * price(prices, "per1kTokens", SEEDANCE_PRICES) * m;
  },
  validate: ({ prompt, params, hasStartFrame, refImages, refVideos }) => {
    const task = str(params.task, "generate");
    if (task === "edit" || task === "extend") {
      if (refVideos < 1) return task === "edit" ? "편집할 영상을 넣어 주세요." : "연장할 영상을 넣어 주세요.";
      if (!prompt.trim()) return "프롬프트를 입력해 주세요.";
      return null;
    }
    if (hasStartFrame && (refImages > 0 || refVideos > 0)) return "시작 프레임과 레퍼런스는 함께 쓸 수 없어요.";
    if (!hasStartFrame && !prompt.trim() && refImages === 0 && refVideos === 0)
      return "프롬프트를 입력해 주세요.";
    return null;
  },
};

/* -------------------------------------------------------------------------- */
/*                                  Export                                    */
/* -------------------------------------------------------------------------- */

export const MODELS: ModelDef[] = [
  seedream5Pro,
  nanoBananaPro,
  nanoBanana2,
  gptImage25,
  gptImage2,
  minimaxH3,
  seedance25,
];

export const MODEL_MAP: Record<string, ModelDef> = Object.fromEntries(MODELS.map((m) => [m.id, m]));

export function getModel(id: string): ModelDef | undefined {
  return MODEL_MAP[id];
}

export const IMAGE_MODELS = MODELS.filter((m) => m.kind === "image");
export const VIDEO_MODELS = MODELS.filter((m) => m.kind === "video");

export function defaultParams(model: ModelDef): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const p of model.params) {
    if (p.type === "seed") continue;
    out[p.key] = p.default;
  }
  return out;
}

/** 파라미터를 모델 정의에 맞게 정리 (알 수 없는 키 제거, 범위 보정) */
export function sanitizeParams(model: ModelDef, input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const p of model.params) {
    const v = input[p.key];
    switch (p.type) {
      case "select":
        out[p.key] = typeof v === "string" && p.options.some((o) => o.value === v) ? v : p.default;
        break;
      case "number": {
        const n = num(v, p.default);
        out[p.key] = Math.min(p.max, Math.max(p.min, p.step ? Math.round(n / p.step) * p.step : n));
        break;
      }
      case "boolean":
        out[p.key] = typeof v === "boolean" ? v : p.default;
        break;
      case "seed": {
        const s = seedOf(v);
        if (s !== undefined) out[p.key] = s;
        break;
      }
    }
  }
  return out;
}

/** 파일명에 쓰는 짧은 모델 슬러그 */
export const MODEL_SLUG: Record<string, string> = {
  "seedream-5-pro": "seedream5pro",
  "nano-banana-pro": "nanobananapro",
  "nano-banana-2": "nanobanana2",
  "gpt-image-2-5": "gptimage25",
  "gpt-image-2": "gptimage2",
  "minimax-h3": "h3",
  "seedance-2-5": "seedance25",
};
