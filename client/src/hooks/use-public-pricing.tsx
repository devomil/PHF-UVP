// Phase NC-03 — Single source the public pricing page reads from.
// Composes /api/billing/plans + /api/billing/topup-packs into one
// normalized shape. No JSX-level pricing/GC/overage constants anywhere.

import { useQuery } from "@tanstack/react-query";

export interface PublicPlan {
  tier: "STARTER" | "GROWTH" | "STUDIO" | "ENTERPRISE";
  displayName: string;
  monthlyGC: number;
  monthlyPriceCents: number;
  annualPriceCents: number;
  annualMonthlyCents: number;
  annualSavingsCents: number;
  rolloverPercent: number;
  rolloverMax: number;
  overageRateCents: number;
  maxResolution: string;
  maxClipDuration: number;
  catalogKeyMonthly: string;
  catalogKeyAnnual: string;
  monthlyConfigured: boolean;
  annualConfigured: boolean;
  providerIds: string[];
  marketingClaims: {
    seats: number | "unlimited";
    brandWorkspaces: number | "unlimited";
    prioritySupport: boolean;
    apiAccess: boolean;
    tagline: string;
  };
}

export interface PublicTopUpPack {
  id: string;
  gc: number;
  priceCents: number;
  catalogKey: string;
  configured: boolean;
  badge: "POPULAR" | "BEST VALUE" | null;
}

export interface PublicGenerationRates {
  liveSourced: boolean;
  tiers: {
    Standard: { min: number; max: number };
    Premium: { min: number; max: number };
    "Top-tier": { min: number; max: number };
  };
  example: {
    clipDurationS: number;
    clipsPerVideo: number;
    videoDurationS: number;
    premiumGCPerClip: number;
    gcPerVideo: number;
    planTier: string;
    planMonthlyGC: number;
    videosPerBudget: number;
  };
}

interface PlansResp { providerConfigured: boolean; plans: PublicPlan[] }
interface PacksResp { providerConfigured: boolean; topupPacks: PublicTopUpPack[] }

export function usePublicPricing() {
  const plansQ = useQuery<PlansResp>({
    queryKey: ["/api/billing/plans"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const r = await fetch("/api/billing/plans");
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });
  const packsQ = useQuery<PacksResp>({
    queryKey: ["/api/billing/topup-packs"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const r = await fetch("/api/billing/topup-packs");
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });
  const ratesQ = useQuery<PublicGenerationRates>({
    queryKey: ["/api/billing/generation-rates"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const r = await fetch("/api/billing/generation-rates");
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });
  const plans = plansQ.data?.plans ?? [];
  const topupPacks = packsQ.data?.topupPacks ?? [];
  const generationRates = ratesQ.data ?? null;
  // catalogConfigured map keyed by catalog key — used to gate CTAs.
  const catalogConfigured = new Map<string, boolean>();
  for (const p of plans) {
    catalogConfigured.set(p.catalogKeyMonthly, p.monthlyConfigured);
    catalogConfigured.set(p.catalogKeyAnnual, p.annualConfigured);
  }
  for (const t of topupPacks) catalogConfigured.set(t.catalogKey, t.configured);
  return {
    plans,
    topupPacks,
    generationRates,
    catalogConfigured,
    providerConfigured: plansQ.data?.providerConfigured ?? false,
    isLoading: plansQ.isLoading || packsQ.isLoading || ratesQ.isLoading,
    error: plansQ.error || packsQ.error || ratesQ.error,
  };
}
