import { describe, expect, it } from "vitest";

import { cutSeries, isCodeLike, nextCutCodes, normalizeCutName, ratioLabel, sameCutName } from "./cuts";

describe("nextCutCodes", () => {
  it("starts at C001", () => {
    expect(nextCutCodes([], 3)).toEqual(["C001", "C002", "C003"]);
  });

  it("continues the last code's shape", () => {
    expect(nextCutCodes(["S02_C05"], 2)).toEqual(["S02_C06", "S02_C07"]);
    expect(nextCutCodes(["C9"], 1)).toEqual(["C10"]);
  });

  it("skips codes that already exist", () => {
    // 마지막 컷(C002) 다음인 C003은 이미 있어서 C004
    expect(nextCutCodes(["C001", "C003", "C002"], 1)).toEqual(["C004"]);
    expect(nextCutCodes(["C001", "C002", "OPENING"], 1)).toEqual(["C003"]);
  });
});

describe("normalizeCutName", () => {
  it("keeps the name as typed, only dropping characters files can't use", () => {
    expect(normalizeCutName("  오프닝   시퀀스 ")).toBe("오프닝 시퀀스");
    expect(normalizeCutName("Seq 03 · night")).toBe("Seq 03 · night");
    expect(normalizeCutName("c/01:a")).toBe("c01a");
    expect(normalizeCutName("   ")).toBe("");
  });

  it("caps the length", () => {
    expect(normalizeCutName("가".repeat(60))).toHaveLength(40);
  });

  it("treats case and spacing differences as the same name", () => {
    expect(sameCutName("seq 01", "SEQ  01")).toBe(true);
    expect(sameCutName("오프닝", "오프닝 2")).toBe(false);
  });
});

describe("cutSeries", () => {
  it("continues a trailing number", () => {
    expect(cutSeries("SEQ_08", 3)).toEqual(["SEQ_08", "SEQ_09", "SEQ_10"]);
    expect(cutSeries("S02_C05", 2, ["S02_C06"])).toEqual(["S02_C05", "S02_C07"]);
  });

  it("numbers names without a trailing number", () => {
    expect(cutSeries("오프닝", 3)).toEqual(["오프닝", "오프닝 2", "오프닝 3"]);
  });

  it("falls back to the next suggestions when empty", () => {
    expect(cutSeries("  ", 2, ["C001"])).toEqual(["C002", "C003"]);
  });
});

describe("isCodeLike", () => {
  it("is true only for ASCII names without spaces", () => {
    expect(isCodeLike("S02_C05")).toBe(true);
    expect(isCodeLike("오프닝")).toBe(false);
    expect(isCodeLike("Seq 03")).toBe(false);
    expect(isCodeLike(null)).toBe(false);
  });
});

describe("ratioLabel", () => {
  it("recognises common ratios", () => {
    expect(ratioLabel(1920, 1080)).toBe("16:9");
    expect(ratioLabel(1080, 1920)).toBe("9:16");
    expect(ratioLabel(1000, 1000)).toBe("1:1");
    expect(ratioLabel(1000, 777)).toBeNull();
    expect(ratioLabel(null, 10)).toBeNull();
  });
});
