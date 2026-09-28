import { describe, expect, it } from "vitest";

import { diffStats, diffWords, tokenize } from "./diff";
import { detectLang } from "./lang";

const apply = (ops: ReturnType<typeof diffWords>, side: "a" | "b") =>
  ops.filter((o) => o.type === "equal" || o.type === (side === "a" ? "delete" : "insert")).map((o) => o.text).join("");

describe("diffWords", () => {
  it("reconstructs both versions exactly", () => {
    const a = "a woman in a red dress, walking in the rain, cinematic 35mm";
    const b = "a woman in a crimson silk dress, running in the rain at night, cinematic 50mm";
    const ops = diffWords(a, b);
    expect(apply(ops, "a")).toBe(a);
    expect(apply(ops, "b")).toBe(b);
  });

  it("marks replaced words as delete + insert", () => {
    const ops = diffWords("red dress", "crimson dress");
    expect(ops).toEqual([
      { type: "delete", text: "red" },
      { type: "insert", text: "crimson" },
      { type: "equal", text: " dress" },
    ]);
    expect(diffStats(ops)).toEqual({ added: 1, removed: 1 });
  });

  it("diffs Chinese per character and Korean per word", () => {
    expect(tokenize("红色连衣裙")).toEqual(["红", "色", "连", "衣", "裙"]);
    const zh = diffWords("红色连衣裙", "蓝色连衣裙");
    expect(apply(zh, "b")).toBe("蓝色连衣裙");
    expect(diffStats(zh)).toEqual({ added: 1, removed: 1 });
    const ko = diffWords("비 오는 밤 거리", "눈 오는 밤 거리");
    expect(ko[0]).toEqual({ type: "delete", text: "비" });
  });

  it("handles empty inputs", () => {
    expect(diffWords("", "new text")).toEqual([{ type: "insert", text: "new text" }]);
    expect(diffWords("old", "")).toEqual([{ type: "delete", text: "old" }]);
    expect(diffWords("same", "same")).toEqual([{ type: "equal", text: "same" }]);
  });
});

describe("detectLang", () => {
  it("detects the dominant language", () => {
    expect(detectLang("A cinematic shot of a neon street at night")).toBe("en");
    expect(detectLang("비 오는 밤 네온 거리의 인물")).toBe("ko");
    expect(detectLang("夜晚霓虹街道上的人物特写")).toBe("zh");
    expect(detectLang("")).toBe("empty");
    expect(detectLang("네온 street 인물 portrait")).toBe("mixed");
  });
});
