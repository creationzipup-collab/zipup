import { describe, expect, it } from "vitest";

import { findMentions, formatMention, linkMentions, mentionIssues, normalizeMentions, orderByMentions, type RefItem, renameGroup } from "./mentions";

const refs: RefItem[] = [
  { id: "a", kind: "image", order: 1, filename: "hero_face.png", thumb: "" },
  { id: "b", kind: "image", order: 2, filename: "jacket_front.jpg", thumb: "" },
  { id: "v", kind: "video", order: 1, filename: "dance.mp4", thumb: "" },
];

describe("findMentions", () => {
  it("finds every style of reference mention", () => {
    const text = "the girl from @img1 wears @Image_2, dancing like [Video 1], style of <image2>, @jacket on top, 图1 背景";
    const ms = findMentions(text);
    expect(ms.map((m) => m.raw)).toEqual(["@img1", "@Image_2", "[Video 1]", "<image2>", "@jacket", "图1"]);
    expect(ms.map((m) => m.key)).toEqual(["image#1", "image#2", "video#1", "image#2", "name:jacket", "image#1"]);
  });

  it("ignores e-mail addresses and plain words without numbers", () => {
    expect(findMentions("send to team@zipup.com, an image of a cat")).toEqual([]);
  });

  it("treats a bare @img as an image without a number", () => {
    const [m] = findMentions("keep @img as is");
    expect(m).toMatchObject({ kind: "image", index: null, key: "image#?" });
  });

  it("reads Korean mentions", () => {
    expect(findMentions("@이미지1의 인물이 @영상1처럼 춤춘다").map((m) => m.key)).toEqual(["image#1", "video#1"]);
  });
});

describe("linkMentions", () => {
  it("links by number, flags missing ones, guesses custom names from filenames", () => {
    const groups = linkMentions(findMentions("@image1 and @image3 wearing @jacket, moves like @video1"), refs);
    const by = Object.fromEntries(groups.map((g) => [g.label, g]));
    expect(by["@image1"]).toMatchObject({ refId: "a", status: "linked" });
    expect(by["@image3"]).toMatchObject({ refId: null, status: "missing" });
    expect(by["@jacket"]).toMatchObject({ refId: "b", status: "guessed" });
    expect(by["@video1"]).toMatchObject({ refId: "v", status: "linked" });
    expect(mentionIssues(groups)).toBe(1);
  });

  it("lets the user relink a group", () => {
    const groups = linkMentions(findMentions("@img1 @img1"), refs, { "image#1": "b" });
    expect(groups[0]).toMatchObject({ refId: "b", status: "linked" });
    expect(groups[0].mentions).toHaveLength(2);
  });

  it("asks which one when a bare mention has several candidates", () => {
    expect(linkMentions(findMentions("@img"), refs)[0].status).toBe("ambiguous");
    expect(linkMentions(findMentions("@video"), refs)[0]).toMatchObject({ status: "guessed", refId: "v" });
  });
});

describe("normalize", () => {
  it("rewrites every linked mention in the model's style and keeps unknown ones", () => {
    const text = "@img2 in red, [Image 1] behind, @mystery prop";
    const groups = linkMentions(findMentions(text), refs);
    expect(normalizeMentions(text, groups, refs, "at").text).toBe("@Image2 in red, @Image1 behind, @mystery prop");
    expect(normalizeMentions(text, groups, refs, "word").text).toBe("Image 2 in red, Image 1 behind, @mystery prop");
    expect(normalizeMentions(text, groups, refs, "natural").text).toBe("image 2 in red, image 1 behind, @mystery prop");
  });

  it("renames all occurrences of a group at once", () => {
    const text = "@hero looks at @hero";
    const [g] = linkMentions(findMentions(text), refs);
    expect(renameGroup(text, g, "@Image1")).toBe("@Image1 looks at @Image1");
  });

  it("formats per style", () => {
    expect(formatMention("video", 2, "at")).toBe("@Video2");
    expect(formatMention("image", 1, "word")).toBe("Image 1");
  });

  it("reorders references by first mention", () => {
    const text = "@img2 first, then @img1";
    const groups = linkMentions(findMentions(text), refs);
    expect(orderByMentions(refs.filter((r) => r.kind === "image"), groups, findMentions(text)).map((r) => r.id)).toEqual(["b", "a"]);
  });
});
