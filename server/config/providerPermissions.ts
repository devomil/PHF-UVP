// Phase NC-01 — Server-authoritative provider gating per plan tier.
// Provider IDs MUST match the keys in `server/services/piapi-test-config.ts`
// so the UI gating and the middleware enforcement stay in lockstep.

import type { PlanTier } from "./plans";

const STARTER_PROVIDERS = [
  "kling-2.5",
  "kling-2.6",
  "hailuo",
  "hunyuan",
  "wan-2.6",
  "ltx-video",
  "i2v-skyreels",
  "wan-2.1",
  "wan-2.2",
  "frame-pack",
] as const;

const GROWTH_ADDITIONS = [
  "kling-3.0-omni",
  "veo-3",
  "veo-3.1",
  "seedance-2-fast",
  "i2v-seedance-2-fast",
  "i2v-seedance-2-first-last-frames",
  "sora-2",
  "i2v-kling-2.6",
  "i2v-kling-2.5",
  "i2v-hailuo",
  "i2v-hailuo-director",
  "i2v-wan-2.6",
  "i2v-luma",
  "i2v-veo-3",
  "i2v-veo-3.1",
  "luma",
  "runway-4.5",
] as const;

const STUDIO_ADDITIONS = [
  "seedance-2",
  "i2v-seedance-2",
  "sora-2-pro",
  "kling-effects",
  "kling-avatar",
  "i2v-kling-avatar",
  "omniavatar",
  "i2v-omniavatar",
  "omnihuman-1.5",
  "runway-gen4",
  "runway-gen4-aleph",
  "runway-act-two",
] as const;

const ENTERPRISE_ADDITIONS: readonly string[] = [];

export const PROVIDER_PERMISSIONS: Record<PlanTier, readonly string[]> = {
  FREE_TRIAL: STARTER_PROVIDERS,
  STARTER: STARTER_PROVIDERS,
  GROWTH: [...STARTER_PROVIDERS, ...GROWTH_ADDITIONS],
  STUDIO: [...STARTER_PROVIDERS, ...GROWTH_ADDITIONS, ...STUDIO_ADDITIONS],
  ENTERPRISE: [...STARTER_PROVIDERS, ...GROWTH_ADDITIONS, ...STUDIO_ADDITIONS, ...ENTERPRISE_ADDITIONS],
};

export function planAllowsProvider(tier: PlanTier, providerId: string): boolean {
  return PROVIDER_PERMISSIONS[tier].includes(providerId);
}

// Returns the lowest tier that grants access to a provider, or null if no
// tier does. Used by the UI to render the "requires Studio" pill.
export function minimumTierForProvider(providerId: string): PlanTier | null {
  const order: PlanTier[] = ["STARTER", "GROWTH", "STUDIO", "ENTERPRISE"];
  for (const tier of order) {
    if (PROVIDER_PERMISSIONS[tier].includes(providerId)) return tier;
  }
  return null;
}
