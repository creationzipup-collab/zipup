import { describe, expect, it } from "vitest";

import { alignSegments, coverage, parseJsonLoose, replaceSegment, splitPhrases } from "./align";

const text = "A woman in a red dress, walking in the rain, cinematic 35mm film";

describe("alignSegments", () => {
  it("maps segments to exact offsets even with small differences", () => {
    const segs = alignSegments(text, [
      { src: "a woman in a red dress,", dst: "빨간 드레스를 입은 여자," },
      { src: "walking  in the rain,", dst: "빗속을 걷는," },
      { src: "cinematic 35mm film", dst: "시네마틱 35mm 필름" },
    ]);
    expect(segs.map((s) => text.slice(s.start, s.end))).toEqual(["A woman in a red dress,", "walking in the rain,", "cinematic 35mm film"]);
    expect(coverage(text, segs)).toBe(1);
  });

  it("keeps untranslated parts as empty segments", () => {
    const segs = alignSegments(text, [
      { src: "A woman in a red dress,", dst: "빨간 드레스를 입은 여자," },
      { src: "cinematic 35mm film", dst: "시네마틱 35mm 필름" },
    ]);
    expect(segs[1]).toMatchObject({ src: "walking in the rain,", dst: "" });
    expect(coverage(text, segs)).toBeLessThan(1);
  });

  it("works for Chinese prompts", () => {
    const zh = "夜晚霓虹街道，穿红色连衣裙的女人，电影感";
    const segs = alignSegments(zh, [
      { src: "夜晚霓虹街道，", dst: "밤의 네온 거리," },
      { src: "穿红色连衣裙的女人，", dst: "빨간 원피스를 입은 여자," },
      { src: "电影感", dst: "영화 같은 느낌" },
    ]);
    expect(segs).toHaveLength(3);
    expect(segs[2]).toMatchObject({ src: "电影感", start: zh.length - 3, end: zh.length });
  });
});

describe("replaceSegment", () => {
  it("replaces one segment and shifts the following offsets", () => {
    const segs = alignSegments(text, [
      { src: "A woman in a red dress,", dst: "빨간 드레스를 입은 여자," },
      { src: "walking in the rain,", dst: "빗속을 걷는," },
    ]);
    const out = replaceSegment(text, segs, 0, "A woman in a crimson silk dress,", "진홍색 실크 드레스를 입은 여자,");
    expect(out.text.startsWith("A woman in a crimson silk dress, walking")).toBe(true);
    expect(out.text.slice(out.segments[1].start, out.segments[1].end)).toBe("walking in the rain,");
    expect(out.segments[0].dst).toBe("진홍색 실크 드레스를 입은 여자,");
  });
});

describe("helpers", () => {
  it("splits phrases and parses loose JSON", () => {
    expect(splitPhrases("a, b. c")).toEqual([{ src: "a," }, { src: "b." }, { src: "c" }]);
    expect(parseJsonLoose<{ a: number }>('Sure!\n```json\n{"a": 1}\n```')).toEqual({ a: 1 });
    expect(parseJsonLoose("no json")).toBeNull();
  });
});
