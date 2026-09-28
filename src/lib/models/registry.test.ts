import { describe, expect, it } from "vitest";

import { defaultParams, getModel, MODELS, sanitizeParams, seedanceTokens } from "./registry";
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
    expect(getModel("seedance-2-5")?.provider).toBe("higgsfield");
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

  it("draft mode renders at 480p with the standard bitrate", () => {
    const params = sanitizeParams(seedance, { ...defaultParams(seedance), draft: true, resolution: "720p", bitrate: "high" });
    const built = seedance.build({ prompt: "draft take", params, urls, count: 1 });
    expect(built.body).toMatchObject({ resolution: "480p", bitrate_mode: "standard" });
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

  it("applies the 30% launch discount before October 2026", () => {
    const during = seedance.estimate(ctx(seedance, { now: DURING_PROMO }), {});
    const after = seedance.estimate(ctx(seedance), {});
    expect(during).toBeCloseTo(after * 0.7, 6);
  });

  it("uses the edit endpoint with the first video as the source", () => {
    const params = sanitizeParams(seedance, { ...defaultParams(seedance), task: "edit" });
    const built = seedance.build({ prompt: "make it night", params, urls: { ...urls, videos: ["https://x/a.mp4", "https://x/b.mp4"] }, count: 1 });
    expect(built.endpoint).toBe("bytedance/seedance-2.5/video-edit");
    expect(built.body).toMatchObject({ video_url: "https://x/a.mp4", video_urls: ["https://x/b.mp4"] });
  });

  it("rejects edit requests without a source video", () => {
    expect(seedance.validate?.({ prompt: "x", params: { task: "edit" }, refImages: 0, hasStartFrame: false, refVideos: 0, refAudios: 0 })).toMatch(/영상/);
  });
});
