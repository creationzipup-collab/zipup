import { describe, expect, it } from "vitest";

import { englishLemmas, GLOSSARY, glossaryByKorean, glossaryLookup, glossaryPhraseAt, normalizeTerm, tokenizeEnglish } from "./glossary";

describe("glossary", () => {
  it("reads film terms the way crews mean them", () => {
    expect(glossaryLookup("dolly")?.ko[0]).toBe("달리");
    expect(glossaryLookup("Dolly Zoom")?.ko[0]).toBe("달리 줌");
    expect(glossaryLookup("film grain")?.ko[0]).toBe("필름 그레인");
    expect(glossaryLookup("rim-lit")?.en).toBe("rim light");
  });

  it("ignores case, hyphens and spacing", () => {
    expect(normalizeTerm("Close-Up")).toBe(normalizeTerm("close up"));
    expect(glossaryLookup("close up")?.en).toBe("close-up");
    expect(glossaryLookup("BOKEH")?.en).toBe("bokeh");
  });

  it("finds base forms of inflected words", () => {
    expect(englishLemmas("flowing")).toContain("flow");
    expect(englishLemmas("puddles")).toContain("puddle");
    expect(glossaryLookup("puddles")?.en).toBe("puddle");
  });

  it("prefers the longest term around the hovered word", () => {
    const text = "slow dolly zoom on a dancer, shallow depth of field";
    const tokens = tokenizeEnglish(text);
    const zoom = tokens.findIndex((t) => t.text === "zoom");
    expect(glossaryPhraseAt(tokens, zoom, text)?.entry.en).toBe("dolly zoom");
    const depth = tokens.findIndex((t) => t.text === "depth");
    expect(glossaryPhraseAt(tokens, depth, text)?.entry.en).toBe("shallow depth of field");
  });

  it("never joins words across commas", () => {
    const text = "wide, angle";
    const tokens = tokenizeEnglish(text);
    expect(glossaryPhraseAt(tokens, 0, text)?.entry.en).not.toBe("wide-angle lens");
  });

  it("keeps lens numbers and ratios as one token", () => {
    expect(tokenizeEnglish("35mm f/1.4 2.39:1 close-up").map((t) => t.text)).toEqual(["35mm", "f/1.4", "2.39:1", "close-up"]);
  });

  it("finds English terms from Korean", () => {
    const hits = glossaryByKorean("역광").map((e) => e.en);
    expect(hits).toContain("back light");
    expect(glossaryByKorean("달리 줌")[0]?.en).toBe("dolly zoom");
  });

  it("has no duplicate forms inside one entry and every entry has Korean", () => {
    for (const e of GLOSSARY) {
      expect(e.ko.length).toBeGreaterThan(0);
      expect(new Set(e.forms).size).toBe(e.forms.length);
    }
  });
});
