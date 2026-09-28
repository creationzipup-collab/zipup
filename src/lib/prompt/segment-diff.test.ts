import { describe, expect, it } from "vitest";

import { diffSegments, similarity, splitClauses } from "@/lib/prompt/segment-diff";

const u = (text: string, ko: string | null = null) => ({ text, ko });

describe("splitClauses", () => {
  it("splits on commas, sentence ends and newlines", () => {
    expect(splitClauses("a woman in a red dress, walking slowly. Heavy fog\n35mm").map((x) => x.text)).toEqual([
      "a woman in a red dress",
      "walking slowly.",
      "Heavy fog",
      "35mm",
    ]);
  });
});

describe("similarity", () => {
  it("is 1 for the same words and low for unrelated ones", () => {
    expect(similarity("a red dress", "A red dress.")).toBe(1);
    expect(similarity("a red dress", "neon city at night")).toBeLessThan(0.34);
    expect(similarity("a woman in a red dress walking", "a woman in a blue dress running")).toBeGreaterThan(0.5);
  });
});

describe("diffSegments", () => {
  it("keeps identical segments as same", () => {
    const r = diffSegments([u("a"), u("b c")], [u("a"), u("b c")]);
    expect(r.map((c) => c.type)).toEqual(["same", "same"]);
  });

  it("pairs a similar segment as changed and keeps both meanings", () => {
    const r = diffSegments(
      [u("a woman in a red dress walking", "빨간 드레스를 입고 걷는 여자"), u("cinematic 35mm", "시네마틱 35mm")],
      [u("a woman in a blue dress running", "파란 드레스를 입고 달리는 여자"), u("cinematic 35mm", "시네마틱 35mm")],
    );
    expect(r.map((c) => c.type)).toEqual(["changed", "same"]);
    const c = r[0];
    if (c.type !== "changed") throw new Error("expected changed");
    expect(c.before.ko).toBe("빨간 드레스를 입고 걷는 여자");
    expect(c.after.ko).toBe("파란 드레스를 입고 달리는 여자");
    expect(c.ops.some((op) => op.type === "insert" && op.text.includes("blue"))).toBe(true);
  });

  it("treats a segment replaced in place as changed", () => {
    const r = diffSegments([u("lighthouse at dusk"), u("heavy fog"), u("wide shot")], [u("lighthouse at dusk"), u("light mist"), u("wide shot")]);
    expect(r.map((c) => c.type)).toEqual(["same", "changed", "same"]);
  });

  it("reports added and removed segments", () => {
    expect(diffSegments([u("lighthouse at dusk"), u("wide shot")], [u("lighthouse at dusk"), u("heavy fog"), u("wide shot")]).map((c) => c.type)).toEqual(["same", "added", "same"]);
    expect(diffSegments([u("lighthouse at dusk"), u("film grain"), u("wide shot")], [u("lighthouse at dusk"), u("wide shot")]).map((c) => c.type)).toEqual(["same", "removed", "same"]);
  });

  it("lists removed before added when a run has more removals", () => {
    const r = diffSegments([u("a"), u("film grain"), u("vhs noise"), u("z")], [u("a"), u("heavy fog"), u("z")]);
    expect(r.map((c) => c.type)).toEqual(["same", "changed", "removed", "same"]);
  });

  it("handles an empty baseline", () => {
    expect(diffSegments([], [u("a"), u("b")]).map((c) => c.type)).toEqual(["added", "added"]);
  });
});
