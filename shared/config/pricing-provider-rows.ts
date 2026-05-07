// Phase NC-03 — Curated provider matrix rows for the public pricing page.
//
// Edit this file (and only this file) to change which 12 providers appear
// in the default "Provider access by plan" view. Anything not listed here
// still appears under "Show all 60+ models" because the matrix derives its
// full set from PROVIDER_PERMISSIONS at render time.

export interface PricingProviderRow {
  id: string; // must match an id in shared/provider-catalog.ts
  displayName: string;
  // One of: "Standard 3–5 GC" | "Premium 5–12 GC" | "Top-tier 12–30 GC"
  tier: "Standard" | "Premium" | "Top-tier";
}

export const CURATED_PRICING_PROVIDER_ROWS: PricingProviderRow[] = [
  { id: "kling-2.6", displayName: "Kling 2.6", tier: "Standard" },
  { id: "hailuo", displayName: "Hailuo", tier: "Standard" },
  { id: "wan-2.6", displayName: "Wan 2.6", tier: "Standard" },
  { id: "hunyuan", displayName: "Hunyuan", tier: "Standard" },
  { id: "luma", displayName: "Luma Dream Machine", tier: "Premium" },
  { id: "runway-4.5", displayName: "Runway 4.5", tier: "Premium" },
  { id: "veo-3", displayName: "Google Veo 3", tier: "Premium" },
  { id: "veo-3.1", displayName: "Google Veo 3.1", tier: "Premium" },
  { id: "sora-2", displayName: "OpenAI Sora 2", tier: "Premium" },
  { id: "seedance-2", displayName: "Seedance 2", tier: "Top-tier" },
  { id: "sora-2-pro", displayName: "OpenAI Sora 2 Pro", tier: "Top-tier" },
  { id: "runway-gen4", displayName: "Runway Gen-4", tier: "Top-tier" },
];

// Tier ranges (min/max GC per clip) are sourced live from
// /api/billing/generation-rates. Only the qualitative blurb lives here.
export const PRICING_TIER_DESCRIPTIONS: Record<PricingProviderRow["tier"], { blurb: string }> = {
  Standard: { blurb: "Reliable everyday models for fast iteration." },
  Premium: { blurb: "Premium models for hero shots and pitch-quality work." },
  "Top-tier": { blurb: "Top-tier flagship models — film-grade output." },
};
