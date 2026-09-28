import { describe, expect, it } from "vitest";

import { isEmptyQuery, parseQuery } from "./query";

describe("parseQuery", () => {
  it("parses tags, people, flags, ratings and colors", () => {
    const q = parseQuery("#인물 @김지훈 is:pick ★4 color:빨강 ratio:16:9");
    expect(q.tags).toEqual(["인물"]);
    expect(q.users).toEqual(["김지훈"]);
    expect(q.flags).toEqual(["pick"]);
    expect(q.minRating).toBe(4);
    expect(q.colors).toEqual(["red"]);
    expect(q.ratio).toBe("16:9");
  });

  it("resolves model aliases", () => {
    expect(parseQuery("model:seedream").models).toContain("seedream-5-pro");
    expect(parseQuery("모델:나노바나나").models.length).toBeGreaterThan(0);
  });

  it("handles phrases, exclusions and synonyms", () => {
    const q = parseQuery('"red dress" -blur 고양이');
    expect(q.phrases).toEqual(["red dress"]);
    expect(q.excludes).toEqual(["blur"]);
    expect(q.terms[0]).toContain("고양이");
    expect(q.terms[0]).toContain("cat");
  });

  it("parses KST date ranges (before is inclusive of the day)", () => {
    const q = parseQuery("after:2026-09-01 before:2026-09-30");
    expect(q.after?.toISOString()).toBe("2026-08-31T15:00:00.000Z");
    expect(q.before?.toISOString()).toBe("2026-09-30T15:00:00.000Z");
  });

  it("recognizes kind and source filters in Korean", () => {
    expect(parseQuery("is:영상").kind).toBe("video");
    expect(parseQuery("is:업로드").source).toBe("upload");
  });

  it("detects an empty query", () => {
    expect(isEmptyQuery(parseQuery("   "))).toBe(true);
    expect(isEmptyQuery(parseQuery("#tag"))).toBe(false);
  });
});
