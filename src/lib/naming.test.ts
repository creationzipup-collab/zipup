import { describe, expect, it } from "vitest";

import { promptKeywords, renderFilename, sanitizeSegment } from "./naming";

const base = {
  project: "신제품 런칭",
  team: "AI제작팀",
  user: "김지훈",
  model: "seedream5pro",
  kind: "image" as const,
  // 2026-09-28 15:30:05 UTC = 2026-09-29 00:30:05 KST
  date: new Date("2026-09-28T15:30:05Z"),
  seq: 12,
  prompt: "A neon city street at night, cinematic, highly detailed",
  ratio: "16:9",
  res: "2K",
  index: 0,
  ext: "png",
};

describe("renderFilename", () => {
  it("renders the default template with KST date and padded sequence", () => {
    expect(renderFilename("{project}_{model}_{date}_{seq}", base)).toBe("신제품-런칭_seedream5pro_20260929_0012.png");
  });

  it("supports every token", () => {
    const name = renderFilename("{team}_{user}_{kind}_{time}_{ratio}_{res}_{index}_{prompt}", { ...base, kind: "video", ext: "mp4" });
    expect(name).toBe("AI제작팀_김지훈_vid_003005_16x9_2K_1_neon-city-street.mp4");
  });

  it("drops unknown tokens and collapses separators", () => {
    expect(renderFilename("{project}__{nope}__{seq}", base)).toBe("신제품-런칭_0012.png");
  });

  it("falls back when the template renders empty", () => {
    expect(renderFilename("{team}", { ...base, team: null })).toBe("zipup_20260929_0012.png");
  });

  it("strips characters that are illegal in file names", () => {
    expect(renderFilename("{project}", { ...base, project: 'a/b:c*d?"e<f>g|h' })).toBe("abcdefgh.png");
  });

  it("caps the base name at 120 characters", () => {
    const name = renderFilename("{project}", { ...base, project: "가".repeat(300) });
    expect(name.length).toBe(120 + ".png".length);
  });
});

describe("promptKeywords", () => {
  it("skips stopwords and keeps order", () => {
    expect(promptKeywords("a photo of a red dress in the rain, highly detailed")).toEqual(["red", "dress", "rain"]);
  });

  it("strips common Korean particles", () => {
    expect(promptKeywords("고양이가 창가에서 햇살을 받는 모습")).toEqual(["고양이", "창가", "햇살"]);
  });
});

describe("sanitizeSegment", () => {
  it("turns spaces into dashes and trims separators", () => {
    expect(sanitizeSegment("  hello   world  ")).toBe("hello-world");
  });
});
