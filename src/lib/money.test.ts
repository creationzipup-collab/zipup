import { describe, expect, it } from "vitest";

import { dayStartKst, formatUsd, monthStartKst, usdToMicros } from "./money";

describe("KST boundaries", () => {
  it("uses the Korean calendar month, not UTC", () => {
    // 2026-09-30 16:00 UTC is already 2026-10-01 01:00 in Seoul
    expect(monthStartKst(new Date("2026-09-30T16:00:00Z")).toISOString()).toBe("2026-09-30T15:00:00.000Z");
    expect(monthStartKst(new Date("2026-09-30T14:00:00Z")).toISOString()).toBe("2026-08-31T15:00:00.000Z");
  });

  it("computes the start of the Korean day", () => {
    expect(dayStartKst(new Date("2026-09-28T03:00:00Z")).toISOString()).toBe("2026-09-27T15:00:00.000Z");
  });
});

describe("money helpers", () => {
  it("stores dollars as integer micro-USD", () => {
    expect(usdToMicros(0.1)).toBe(100_000);
    expect(usdToMicros(1.2345678)).toBe(1_234_568);
  });

  it("formats small and large amounts", () => {
    expect(formatUsd(140_000)).toBe("$0.14");
    expect(formatUsd(4_500)).toBe("$0.0045");
    expect(formatUsd(1_234_560_000)).toBe("$1,234.56");
  });
});
