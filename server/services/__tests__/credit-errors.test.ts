// Phase NC-02 — typed credit error envelope tests.

import { describe, it, expect } from "vitest";
import {
  InsufficientCreditsError,
  ProviderNotInPlanError,
  isInsufficientCreditsLike,
  parseLegacyInsufficient,
} from "../credit-errors";

describe("credit-errors", () => {
  it("InsufficientCreditsError computes shortfall and serializes", () => {
    const err = new InsufficientCreditsError({
      required: 50,
      available: 12,
      provider: "kling-2.6",
      quality: "std",
      durationS: 5,
    });
    expect(err.code).toBe("INSUFFICIENT_CREDITS");
    expect(err.shortfall).toBe(38);
    const env = err.toEnvelope();
    expect(env.success).toBe(false);
    expect(env.code).toBe("INSUFFICIENT_CREDITS");
    expect(env.required).toBe(50);
    expect(env.available).toBe(12);
    expect(env.shortfall).toBe(38);
    expect(env.provider).toBe("kling-2.6");
  });

  it("InsufficientCreditsError clamps shortfall at 0", () => {
    const err = new InsufficientCreditsError({ required: 5, available: 10 });
    expect(err.shortfall).toBe(0);
  });

  it("ProviderNotInPlanError carries plan context", () => {
    const err = new ProviderNotInPlanError("sora-2-pro", "STARTER", "STUDIO");
    const env = err.toEnvelope();
    expect(env.code).toBe("PROVIDER_NOT_IN_PLAN");
    expect(env.provider).toBe("sora-2-pro");
    expect(env.requiredPlan).toBe("STUDIO");
    expect(env.currentPlan).toBe("STARTER");
  });

  it("isInsufficientCreditsLike detects typed + legacy throws", () => {
    expect(isInsufficientCreditsLike(new InsufficientCreditsError({ required: 10, available: 1 }))).toBe(true);
    expect(isInsufficientCreditsLike(new Error("INSUFFICIENT_CREDITS: required=10 available=1"))).toBe(true);
    expect(isInsufficientCreditsLike(new Error("network down"))).toBe(false);
    expect(isInsufficientCreditsLike(null)).toBe(false);
  });

  it("parseLegacyInsufficient extracts numbers from legacy throws", () => {
    const e = parseLegacyInsufficient(new Error("INSUFFICIENT_CREDITS: required=42 available=7"), { provider: "veo-3" });
    expect(e.required).toBe(42);
    expect(e.available).toBe(7);
    expect(e.shortfall).toBe(35);
    expect(e.provider).toBe("veo-3");
  });

  it("parseLegacyInsufficient falls back to defaults when message is opaque", () => {
    const e = parseLegacyInsufficient(new Error("something else"), { required: 100, available: 0, provider: "x" });
    expect(e.required).toBe(100);
    expect(e.available).toBe(0);
  });
});
