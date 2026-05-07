// Phase NC-01 + NC-02 — Credit balance hook with optimistic decrement.
//
// All warning thresholds (warningLevel/percentUsed/daysUntilReset) are
// computed by the server (deriveWarning in credits-service) and shipped
// in /api/credits/balance — the client trusts those fields verbatim.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

export type CreditWarningLevel = "calm" | "warning" | "urgent" | "empty";

export interface CreditSnapshot {
  subscriptionGC: number;
  topupGC: number;
  totalGC: number;
  monthlyGC: number;
  plan: "FREE_TRIAL" | "STARTER" | "GROWTH" | "STUDIO" | "ENTERPRISE";
  status: string;
  cycleStart: string | null;
  cycleEnd: string | null;
  warningLevel: CreditWarningLevel;
  percentUsed: number;
  daysUntilReset: number | null;
}

const KEY = ["/api/credits/balance"];

export function useCredits() {
  const qc = useQueryClient();
  const q = useQuery<CreditSnapshot>({
    queryKey: KEY,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  // Spec contract: callers asked for a derived `cycleEndDate` Date object
  // alongside the raw ISO string from the server. We compute it on read so
  // the source of truth (server-side cycleEnd) never gets stale.
  const cycleEndDate = q.data?.cycleEnd ? new Date(q.data.cycleEnd) : null;

  const optimisticDecrement = useCallback(
    (gcAmount: number) => {
      qc.setQueryData<CreditSnapshot | undefined>(KEY, (old) => {
        if (!old) return old;
        const subSpend = Math.min(gcAmount, old.subscriptionGC);
        const topSpend = gcAmount - subSpend;
        return {
          ...old,
          subscriptionGC: old.subscriptionGC - subSpend,
          topupGC: Math.max(0, old.topupGC - topSpend),
          totalGC: Math.max(0, old.totalGC - gcAmount),
        };
      });
    },
    [qc],
  );

  const refresh = useCallback(() => {
    qc.invalidateQueries({ queryKey: KEY });
  }, [qc]);

  return { ...q, optimisticDecrement, refresh, cycleEndDate };
}

export interface CreditCostInfo {
  provider: string;
  quality: string | null;
  durationS: number | null;
  gcCost: number;
}

export function useCreditCost(provider: string | null, quality?: string | null, durationS?: number | null) {
  const params = new URLSearchParams();
  if (provider) params.set("provider", provider);
  if (quality) params.set("quality", quality);
  if (durationS != null) params.set("durationS", String(durationS));
  return useQuery<CreditCostInfo>({
    queryKey: ["/api/credits/cost", provider, quality, durationS],
    enabled: !!provider,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const res = await fetch(`/api/credits/cost?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });
}
