// Phase NC-01 — Processor-agnostic billing catalog.
//
// Catalog keys are stable internal identifiers ("STARTER_MONTHLY", "PACK_500").
// The active BillingProvider implementation maps them to its own SKU/price
// records. Stripe resolves them via Price `lookup_key` (lowercase form of
// the catalog key — see `catalogKeyToLookupKey`); a future Paddle adapter
// would do the equivalent lookup with its own SDK. The catalog itself does
// NOT import any processor SDK — that lives in `server/services/billing/`.

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

// Convention shared by every provider adapter that needs a per-SKU
// identifier on the processor side: the lookup key is the lowercase form
// of the catalog key (STARTER_MONTHLY → starter_monthly). Stripe uses this
// as the Price `lookup_key`; Paddle would use it the same way for a price
// `name`. Defining this once here keeps providers consistent.
export function catalogKeyToLookupKey(catalogKey: string): string {
  return catalogKey.toLowerCase();
}

export function lookupKeyToCatalogKey(lookupKey: string): string {
  return lookupKey.toUpperCase();
}

// All catalog lookup keys, useful for batch prefetch (e.g. Stripe
// `prices.list({ lookup_keys: [...] })`).
export function allLookupKeys(): string[] {
  return BILLING_CATALOG.map((e) => catalogKeyToLookupKey(e.key));
}
