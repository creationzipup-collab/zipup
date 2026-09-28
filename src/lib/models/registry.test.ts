import { describe, expect, it } from "vitest";

import { buildRequest, defaultParams, getModel, gptImageSize, modelProviders, MODELS, sanitizeParams, seedanceCompleteUsd, seedanceTokens } from "./registry";
import type { EstimateContext, ModelDef } from "./types";

const urls = { images: [] as string[], videos: [] as string[], audios: [] as string[] };
const AFTER_PROMO = new Date("2026-11-01T00:00:00Z");
const DURING_PROMO = new Date("2026-09-15T00:00:00Z");

function ctx(model: ModelDef, over: Partial<EstimateContext> = {}): EstimateContext {
  return {
    params: sanitizeParams(model, defaultParams(model)),
    count: 1,
    refImages: 0,
    hasStartFrame: false,
    refVideos: 0,
    inputVideoSeconds: 0,
    now: AFTER_PROMO,
    ...over,
  };
}

describe("model registry", () => {
  it("contains the seven requested models", () => {
    expect(MODELS.map((m) => m.id).sort()).toEqual(
      ["gpt-image-2", "gpt-image-2-5", "minimax-h3", "nano-banana-2", "nano-banana-pro", "seedance-2-5", "seedream-5-pro"].sort(),
    );
    expect(new Set(MODELS.map((m) => m.id)).size).toBe(MODELS.length);
  });

  it("routes each model to the intended provider", () => {
    expect(getModel("seedream-5-pro")?.provider).toBe("fal");
    expect(getModel("nano-banana-pro")?.provider).toBe("fal");
    expect(getModel("nano-banana-2")?.provider).toBe("fal");
    expect(getModel("gpt-image-2-5")?.provider).toBe("higgsfield");
    expect(getModel("minimax-h3")?.provider).toBe("higgsfield");
    // 공식 드래프트(draft → draft/complete)는 fal.ai에서 지원
    expect(getModel("seedance-2-5")?.provider).toBe("fal");
    // Higgsfield 모델은 fal.ai로도 보낼 수 있음
    expect(modelProviders(getModel("gpt-image-2-5")!)).toEqual(["higgsfield", "fal"]);
    expect(modelProviders(getModel("gpt-image-2")!)).toEqual(["higgsfield", "fal"]);
    expect(modelProviders(getModel("minimax-h3")!)).toEqual(["higgsfield", "fal"]);
    expect(modelProviders(getModel("seedance-2-5")!)).toEqual(["fal", "higgsfield"]);
  });

  it.each(MODELS.flatMap((m) => modelProviders(m).map((p) => [m.id, p, m] as const)))("%s builds for %s", (_id, provider, m) => {
    const params = sanitizeParams(m, defaultParams(m));
    const built = buildRequest(m, provider, { prompt: "a test prompt", params, urls, count: 1 });
    expect(built.endpoint).toMatch(/\S/);
    expect(built.body).toMatchObject({ prompt: "a test prompt" });
  });

  it("uses fal endpoint names and fields for GPT Image and H3", () => {
    const gpt = getModel("gpt-image-2-5")!;
    const g = buildRequest(gpt, "fal", { prompt: "p", params: { ...defaultParams(gpt), variant: "sunburst", aspectRatio: "16:9", resolution: "4k" }, urls: { ...urls, images: ["https://x/a.png"] }, count: 1 });
    expect(g.endpoint).toBe("openai/gpt-image-2.5/sunburst/edit");
    expect(g.body).toMatchObject({ image_urls: ["https://x/a.png"], quality: "high" });
    const h3 = getModel("minimax-h3")!;
    const h = buildRequest(h3, "fal", { prompt: "p", params: defaultParams(h3), urls: { ...urls, images: ["https://x/a.png"] }, count: 1 });
    expect(h.endpoint).toBe("minimax/h3/reference-to-video");
    expect(h.body).toMatchObject({ reference_image_urls: ["https://x/a.png"], resolution: "2K" });
  });

  it("keeps fal GPT Image sizes inside the documented limits", () => {
    for (const ratio of ["1:1", "16:9", "9:16", "21:9", "3:2", "2:3"]) {
      for (const res of ["1k", "2k", "4k"]) {
        const s = gptImageSize(ratio, res);
        if (s === "auto") continue;
        expect(s.width % 16).toBe(0);
        expect(s.height % 16).toBe(0);
        expect(Math.max(s.width, s.height)).toBeLessThanOrEqual(3840);
        expect(s.width * s.height).toBeGreaterThanOrEqual(655_360);
        expect(s.width * s.height).toBeLessThanOrEqual(8_294_400);
      }
    }
    expect(gptImageSize("auto", "2k")).toBe("auto");
  });

  it.each(MODELS.map((m) => [m.id, m] as const))("%s builds a request and a sane estimate from defaults", (_id, m) => {
    const params = sanitizeParams(m, defaultParams(m));
    const built = m.build({ prompt: "a test prompt", params, urls, count: 1 });
    expect(built.endpoint).toMatch(/\S/);
    expect(built.expectedOutputs).toBeGreaterThan(0);
    expect(built.body).toMatchObject({ prompt: "a test prompt" });
    const usd = m.estimate(ctx(m), {});
    expect(usd).toBeGreaterThan(0);
    expect(usd).toBeLessThan(20);
  });

  it("clamps out-of-range and unknown parameter values", () => {
    const h3 = getModel("minimax-h3")!;
    const p = sanitizeParams(h3, { duration: 99, aspectRatio: "7:3", watermark: "yes" });
    expect(p.duration).toBe(15);
    expect(p.aspectRatio).toBe("16:9");
    expect(p.watermark).toBe(false);
  });

  it("applies admin price overrides", () => {
    const h3 = getModel("minimax-h3")!;
    const base = h3.estimate(ctx(h3), {});
    expect(h3.estimate(ctx(h3), { perSecond: 0.26 })).toBeCloseTo(base * 2, 6);
  });
});

describe("Seedance 2.5", () => {
  const seedance = getModel("seedance-2-5")!;

  it("draft mode sends the official draft flag at 480p", () => {
    const params = sanitizeParams(seedance, { ...defaultParams(seedance), draft: true, resolution: "1080p", bitrate: "high" });
    const built = seedance.build({ prompt: "draft take", params, urls, count: 1 });
    expect(built.endpoint).toBe("bytedance/seedance-2.5/text-to-video");
    expect(built.body).toMatchObject({ draft: true, resolution: "480p", bitrate_mode: "standard", duration: "5" });
  });

  it("prices the 1080p completion of a draft", () => {
    // 1920×1080 × 5초 × 24 / 1024 = 243,000 토큰 × $0.0234/1k
    expect(seedanceTokens("1080p", 5)).toBe(243_000);
    expect(seedanceCompleteUsd(5)).toBeCloseTo(5.6862, 4);
  });

  it("draft costs less than a 720p render of the same shot", () => {
    const draft = seedance.estimate(ctx(seedance, { params: { ...defaultParams(seedance), draft: true } }), {});
    const full = seedance.estimate(ctx(seedance), {});
    expect(draft).toBeLessThan(full / 2);
  });

  it("bills edits for the source video twice and extends for source + new seconds", () => {
    const edit = seedance.estimate(ctx(seedance, { params: { ...defaultParams(seedance), task: "edit" }, refVideos: 1, inputVideoSeconds: 8 }), {});
    const tokens = seedanceTokens("720p", 16);
    expect(edit).toBeCloseTo((tokens / 1000) * 0.0214, 6);

    const extend = seedance.estimate(ctx(seedance, { params: { ...defaultParams(seedance), task: "extend", duration: 5 }, refVideos: 1, inputVideoSeconds: 8 }), {});
    expect(extend).toBeCloseTo((seedanceTokens("720p", 13) / 1000) * 0.0214, 6);
  });

  it("applies the Higgsfield launch discount only on Higgsfield", () => {
    const during = seedance.estimate(ctx(seedance, { now: DURING_PROMO, provider: "higgsfield" }), {});
    const after = seedance.estimate(ctx(seedance, { provider: "higgsfield" }), {});
    expect(during).toBeCloseTo(after * 0.7, 6);
    expect(seedance.estimate(ctx(seedance, { now: DURING_PROMO, provider: "fal" }), {})).toBeCloseTo(after, 6);
  });

  it("edits through reference-to-video on fal and video-edit on Higgsfield", () => {
    const params = sanitizeParams(seedance, { ...defaultParams(seedance), task: "edit" });
    const videos = ["https://x/a.mp4", "https://x/b.mp4"];
    const onFal = buildRequest(seedance, "fal", { prompt: "make it night", params, urls: { ...urls, videos }, count: 1 });
    expect(onFal.endpoint).toBe("bytedance/seedance-2.5/reference-to-video");
    expect(onFal.body).toMatchObject({ task: "editing", video_urls: videos });
    const onHf = buildRequest(seedance, "higgsfield", { prompt: "make it night", params, urls: { ...urls, videos }, count: 1 });
    expect(onHf.endpoint).toBe("bytedance/seedance-2.5/video-edit");
    expect(onHf.body).toMatchObject({ video_url: "https://x/a.mp4", video_urls: ["https://x/b.mp4"] });
  });

  it("rejects edit requests without a source video", () => {
    expect(seedance.validate?.({ prompt: "x", params: { task: "edit" }, refImages: 0, hasStartFrame: false, refVideos: 0, refAudios: 0 })).toMatch(/영상/);
  });
});
