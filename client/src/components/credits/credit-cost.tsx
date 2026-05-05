// Phase NC-01 — Inline cost preview shown above the generate button.

import { useCredits, useCreditCost } from "@/hooks/use-credits";

interface Props {
  provider: string | null;
  quality?: string | null;
  durationS?: number | null;
}

export function CreditCost({ provider, quality, durationS }: Props) {
  const { data: cost } = useCreditCost(provider, quality, durationS);
  const { data: bal } = useCredits();
  if (!cost || !bal) return null;
  const remaining = Math.max(0, bal.totalGC - cost.gcCost);
  const pctOfRemaining = bal.totalGC > 0 ? cost.gcCost / bal.totalGC : 1;
  const tone = pctOfRemaining < 0.05 ? "text-emerald-400" : pctOfRemaining < 0.2 ? "text-amber-400" : "text-orange-400";
  const insufficient = bal.totalGC < cost.gcCost;
  return (
    <div className="text-xs flex items-center gap-2" data-testid="credit-cost">
      <span className={`font-medium ${insufficient ? "text-red-400" : tone}`}>
        ~{cost.gcCost} GC
      </span>
      <span className="text-muted-foreground">
        {insufficient ? `Need ${cost.gcCost - bal.totalGC} more` : `You'll have ${remaining} GC left`}
      </span>
    </div>
  );
}
