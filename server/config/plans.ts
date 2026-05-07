// Phase NC-01 — Plan configuration. Source of truth: NC_Credit_Architecture.md.
// Pricing in cents. monthlyGC is the per-cycle GC budget. rolloverPercent / rolloverMax
// govern how much unused subscription GC carries to the next cycle on `invoice.paid`.

export type PlanTier = "FREE_TRIAL" | "STARTER" | "GROWTH" | "STUDIO" | "ENTERPRISE";
export type SubStatus = "ACTIVE" | "PAST_DUE" | "CANCELED" | "TRIALING" | "PAUSED";

export interface PlanConfig {
  tier: PlanTier;
  displayName: string;
  monthlyGC: number;
  monthlyPriceCents: number;
  annualPriceCents: number; // total per year
  rolloverPercent: number; // % of unused subscription GC that rolls into next cycle
  rolloverMax: number; // hard cap on rollover GC
  overageRateCents: number; // cents per GC over budget (informational)
  maxResolution: "720p" | "1080p" | "4k";
  maxClipDuration: number; // seconds
  // Catalog keys map to env-var names inside billing-catalog.ts.
  catalogKeyMonthly: string;
  catalogKeyAnnual: string;
}

export const PLAN_CONFIG: Record<PlanTier, PlanConfig> = {
  FREE_TRIAL: {
    tier: "FREE_TRIAL",
    displayName: "Free Trial",
    monthlyGC: 50,
    monthlyPriceCents: 0,
    annualPriceCents: 0,
    rolloverPercent: 0,
    rolloverMax: 0,
    overageRateCents: 0,
    maxResolution: "720p",
    maxClipDuration: 5,
    catalogKeyMonthly: "FREE_TRIAL",
    catalogKeyAnnual: "FREE_TRIAL",
  },
  STARTER: {
    tier: "STARTER",
    displayName: "Starter",
    monthlyGC: 200,
    monthlyPriceCents: 5900,
    annualPriceCents: 58800,
    rolloverPercent: 0,
    rolloverMax: 0,
    overageRateCents: 12,
    maxResolution: "720p",
    maxClipDuration: 5,
    catalogKeyMonthly: "STARTER_MONTHLY",
    catalogKeyAnnual: "STARTER_ANNUAL",
  },
  GROWTH: {
    tier: "GROWTH",
    displayName: "Growth",
    monthlyGC: 500,
    monthlyPriceCents: 14900,
    annualPriceCents: 148800,
    rolloverPercent: 25,
    rolloverMax: 125,
    overageRateCents: 10,
    maxResolution: "1080p",
    maxClipDuration: 10,
    catalogKeyMonthly: "GROWTH_MONTHLY",
    catalogKeyAnnual: "GROWTH_ANNUAL",
  },
  STUDIO: {
    tier: "STUDIO",
    displayName: "Studio",
    monthlyGC: 1200,
    monthlyPriceCents: 29900,
    annualPriceCents: 298800,
    rolloverPercent: 50,
    rolloverMax: 600,
    overageRateCents: 8.5,
    maxResolution: "4k",
    maxClipDuration: 10,
    catalogKeyMonthly: "STUDIO_MONTHLY",
    catalogKeyAnnual: "STUDIO_ANNUAL",
  },
  ENTERPRISE: {
    tier: "ENTERPRISE",
    displayName: "Enterprise",
    monthlyGC: 3000,
    monthlyPriceCents: 50000,
    annualPriceCents: 600000,
    rolloverPercent: 100,
    rolloverMax: 3000,
    overageRateCents: 7,
    maxResolution: "4k",
    maxClipDuration: 10,
    catalogKeyMonthly: "ENTERPRISE_MONTHLY",
    catalogKeyAnnual: "ENTERPRISE_ANNUAL",
  },
};

export const PAID_PLANS: PlanTier[] = ["STARTER", "GROWTH", "STUDIO", "ENTERPRISE"];

export function getPlanConfig(tier: PlanTier): PlanConfig {
  return PLAN_CONFIG[tier];
}

export function isPaidPlan(tier: PlanTier): boolean {
  return PAID_PLANS.includes(tier);
}

// Top-up packs — never expire; consumed after subscription credits.
export type TopUpBadge = "POPULAR" | "BEST VALUE" | null;
export interface TopUpPackConfig {
  id: string;
  gc: number;
  priceCents: number;
  catalogKey: string; // maps to env var via billing-catalog
  badge?: TopUpBadge; // optional marketing badge surfaced on /pricing
}

export const TOPUP_PACKS: TopUpPackConfig[] = [
  { id: "PACK_100", gc: 100, priceCents: 1100, catalogKey: "PACK_100", badge: null },
  { id: "PACK_250", gc: 250, priceCents: 2500, catalogKey: "PACK_250", badge: null },
  { id: "PACK_500", gc: 500, priceCents: 4500, catalogKey: "PACK_500", badge: "POPULAR" },
  { id: "PACK_1000", gc: 1000, priceCents: 8000, catalogKey: "PACK_1000", badge: null },
  { id: "PACK_2500", gc: 2500, priceCents: 17500, catalogKey: "PACK_2500", badge: "BEST VALUE" },
];

export function getTopUpPack(id: string): TopUpPackConfig | undefined {
  return TOPUP_PACKS.find((p) => p.id === id);
}
