import { describe, expect, it } from "vitest";

import { nextCutCodes, normalizeCutCode, ratioLabel } from "./cuts";

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

describe("normalizeCutCode", () => {
  it("uppercases and removes risky characters", () => {
    expect(normalizeCutCode(" s02 c05 ")).toBe("S02_C05");
    expect(normalizeCutCode("c/01:a")).toBe("C01A");
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
