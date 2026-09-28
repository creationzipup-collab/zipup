import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseMp4 } from "./mp4";

const mock = (name: string) => readFileSync(join(process.cwd(), "public/mock", name));

describe("parseMp4", () => {
  it("reads duration and size of the bundled mock clips", () => {
    const wide = parseMp4(mock("mock-16x9.mp4"));
    expect(wide.width! / wide.height!).toBeCloseTo(16 / 9, 1);
    expect(wide.durationSec).toBeGreaterThan(1);

    const tall = parseMp4(mock("mock-9x16.mp4"));
    expect(tall.height).toBeGreaterThan(tall.width!);
  });

  it("returns nothing for non-MP4 data", () => {
    expect(parseMp4(Buffer.from("not a video at all"))).toEqual({});
  });
});
