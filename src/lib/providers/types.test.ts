import { describe, expect, it } from "vitest";

import { mapHttpError } from "./types";

describe("mapHttpError", () => {
  it("treats a fal account locked for top-up as a balance problem", () => {
    const err = mapHttpError(403, "User is locked. Reason: TOP_UP.");
    expect(err.code).toBe("credits");
    expect(err.message).toContain("잔액");
  });

  it("treats exhausted balance as a balance problem", () => {
    expect(mapHttpError(403, "Exhausted balance. Top up your balance at fal.ai/dashboard/billing.").message).toContain("잔액");
  });

  it("keeps other refusals as-is", () => {
    const err = mapHttpError(403, "Forbidden: model not enabled");
    expect(err.code).toBe("credits");
    expect(err.message).toContain("model not enabled");
    expect(err.message).not.toContain("잔액");
  });

  it("marks rate limits and outages as retryable", () => {
    expect(mapHttpError(429, "").retryable).toBe(true);
    expect(mapHttpError(503, "").retryable).toBe(true);
    expect(mapHttpError(401, "").retryable).toBe(false);
  });
});
