// Phase NC-01 — Processor-agnostic billing catalog.
//
// Catalog keys are stable internal identifiers ("STARTER_MONTHLY", "PACK_500", etc).
// The active BillingProvider implementation maps them to its own price IDs
// via env vars. Stripe uses STRIPE_PRICE_<KEY>; a future Paddle adapter
// would use PADDLE_PRICE_<KEY>. The catalog itself does NOT import any
// processor SDK — that lives in `server/services/billing/`.

import { PLAN_CONFIG, TOPUP_PACKS, type PlanTier, type PlanConfig, type TopUpPackConfig } from "./plans";

export type CatalogKind = "subscription" | "topup";

export interface CatalogEntry {
  key: string;
  kind: CatalogKind;
  // For subscription entries:
  planTier?: PlanTier;
  billingPeriod?: "monthly" | "annual";
  // For topup entries:
  pack?: TopUpPackConfig;
  // Display-friendly metadata.
  displayName: string;
}

function buildCatalog(): CatalogEntry[] {
  const out: CatalogEntry[] = [];
  for (const [tier, plan] of Object.entries(PLAN_CONFIG) as [PlanTier, PlanConfig][]) {
    if (tier === "FREE_TRIAL") continue;
    out.push({
      key: plan.catalogKeyMonthly,
      kind: "subscription",
      planTier: tier,
      billingPeriod: "monthly",
      displayName: `${plan.displayName} (Monthly)`,
    });
    out.push({
      key: plan.catalogKeyAnnual,
      kind: "subscription",
      planTier: tier,
      billingPeriod: "annual",
      displayName: `${plan.displayName} (Annual)`,
    });
  }
  for (const pack of TOPUP_PACKS) {
    out.push({ key: pack.catalogKey, kind: "topup", pack, displayName: `${pack.gc} GC pack` });
  }
  return out;
}

export const BILLING_CATALOG: CatalogEntry[] = buildCatalog();

export function getCatalogEntry(key: string): CatalogEntry | undefined {
  return BILLING_CATALOG.find((e) => e.key === key);
}

// Convention: env-var name for a Stripe price ID for catalog key X is
// `STRIPE_PRICE_X`. Returning `null` here means the user hasn't configured
// that price yet — the route layer translates this into a 502
// `BILLING_NOT_CONFIGURED` and the UI renders a "Coming soon" tile.
export function getStripePriceId(catalogKey: string): string | null {
  const envKey = `STRIPE_PRICE_${catalogKey}`;
  const value = process.env[envKey];
  return value && value.length > 0 ? value : null;
}

export function isCatalogEntryConfigured(catalogKey: string): boolean {
  return getStripePriceId(catalogKey) !== null;
}
