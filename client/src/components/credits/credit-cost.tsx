// Phase NC-01 + NC-02 — Inline cost preview shown above the generate
// button. The "Top up" CTA inside the preview opens the shared modal
// so the click site never needs to wire its own state.

import { useCredits, useCreditCost } from "@/hooks/use-credits";
import { useCreditModals } from "@/components/credits/credit-modals-provider";
import { Coins } from "lucide-react";

interface Props {
  provider: string | null;
  quality?: string | null;
  durationS?: number | null;
  // When true, render a compact one-liner suitable for sitting next to
  // a generate button. False renders the full pill with the CTA.
  compact?: boolean;
}

export function CreditCost({ provider, quality, durationS, compact = false }: Props) {
  const { data: cost } = useCreditCost(provider, quality, durationS);
  const { data: bal } = useCredits();
  const { openTopUp } = useCreditModals();
  if (!cost || !bal) return null;
  const remaining = Math.max(0, bal.totalGC - cost.gcCost);
  const insufficient = bal.totalGC < cost.gcCost;
  const shortfall = insufficient ? cost.gcCost - bal.totalGC : 0;

  const tone = insufficient
    ? "text-rose-300"
    : remaining < (bal.monthlyGC || 1) * 0.05
      ? "text-orange-300"
      : remaining < (bal.monthlyGC || 1) * 0.2
        ? "text-amber-300"
        : "text-emerald-300";

  if (compact) {
    return (
      <span className={`inline-flex items-center gap-1 text-xs font-medium ${tone}`} data-testid="credit-cost">
        <Coins className="w-3 h-3" />~{cost.gcCost} GC
      </span>
    );
  }

  return (
    <div
      className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-purple-500/15 bg-gradient-to-r from-purple-950/30 to-indigo-950/20 text-xs"
      data-testid="credit-cost"
    >
      <div className="flex items-center gap-2 min-w-0">
        <Coins className={`w-3.5 h-3.5 ${tone}`} />
        <span className={`font-semibold ${tone}`}>~{cost.gcCost} GC</span>
        <span className="text-muted-foreground truncate">
          {insufficient ? `Need ${shortfall} more` : `You'll have ${remaining} GC left`}
        </span>
      </div>
      {insufficient && (
        <button
          onClick={() => openTopUp({ shortfall, required: cost.gcCost, provider: cost.provider })}
          className="shrink-0 px-2.5 py-1 rounded-md text-[11px] font-medium bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:from-purple-500 hover:to-indigo-500"
          data-testid="credit-cost-topup"
        >
          Top up
        </button>
      )}
    </div>
  );
}
