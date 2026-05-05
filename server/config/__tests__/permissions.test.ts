// Phase NC-01 — Plan + permission unit tests.

import { describe, it, expect } from "vitest";
import { PLAN_CONFIG, TOPUP_PACKS, getTopUpPack } from "../plans";
import { planAllowsProvider, minimumTierForProvider } from "../providerPermissions";
import { BILLING_CATALOG, getCatalogEntry, getStripePriceId, isCatalogEntryConfigured } from "../billing-catalog";

describe("plans config", () => {
  it("has the required tiers with correct GC budgets", () => {
    expect(PLAN_CONFIG.STARTER.monthlyGC).toBe(200);
    expect(PLAN_CONFIG.GROWTH.monthlyGC).toBe(500);
    expect(PLAN_CONFIG.STUDIO.monthlyGC).toBe(1200);
    expect(PLAN_CONFIG.FREE_TRIAL.monthlyGC).toBe(50);
  });

  it("has all the required top-up packs", () => {
    const ids = TOPUP_PACKS.map((p) => p.id);
    expect(ids).toEqual(["PACK_100", "PACK_250", "PACK_500", "PACK_1000", "PACK_2500"]);
    expect(getTopUpPack("PACK_500")?.priceCents).toBe(4500);
  });
});

describe("provider permissions", () => {
  it("STARTER cannot access premium providers", () => {
    expect(planAllowsProvider("STARTER", "veo-3")).toBe(false);
    expect(planAllowsProvider("STARTER", "sora-2-pro")).toBe(false);
  });
  it("GROWTH includes STARTER + premium", () => {
    expect(planAllowsProvider("GROWTH", "kling-2.6")).toBe(true);
    expect(planAllowsProvider("GROWTH", "veo-3")).toBe(true);
    expect(planAllowsProvider("GROWTH", "sora-2-pro")).toBe(false);
  });
  it("STUDIO includes top-tier", () => {
    expect(planAllowsProvider("STUDIO", "sora-2-pro")).toBe(true);
    expect(planAllowsProvider("STUDIO", "omnihuman-1.5")).toBe(true);
  });
  it("minimumTierForProvider returns the lowest tier", () => {
    expect(minimumTierForProvider("kling-2.6")).toBe("STARTER");
    expect(minimumTierForProvider("veo-3")).toBe("GROWTH");
    expect(minimumTierForProvider("sora-2-pro")).toBe("STUDIO");
    expect(minimumTierForProvider("nonexistent-provider")).toBe(null);
  });
});

describe("billing catalog", () => {
  it("contains entries for every plan and pack", () => {
    expect(getCatalogEntry("STARTER_MONTHLY")).toBeDefined();
    expect(getCatalogEntry("STARTER_ANNUAL")).toBeDefined();
    expect(getCatalogEntry("PACK_500")).toBeDefined();
    expect(BILLING_CATALOG.length).toBeGreaterThan(10);
  });
  it("returns null for unconfigured Stripe price ids", () => {
    expect(getStripePriceId("DOES_NOT_EXIST")).toBe(null);
    expect(isCatalogEntryConfigured("DOES_NOT_EXIST")).toBe(false);
  });
});
