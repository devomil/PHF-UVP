// Phase NC-01 + NC-02 — Inline cost preview shown above the generate
// button. Three render modes:
//
//   compact  — single-line "~N GC" chip for tight rows.
//   default  — pill with required + remaining-after summary, plus a
//              prominent Top-up CTA when the balance falls short.
//   detail   — full breakdown card (required vs available vs after,
//              plus the inline insufficient state with a contextual
//              "Top up N more GC" link). Used on the main generation
//              surfaces (provider/quality/duration/script/QA panels).
//
// Loading state renders an animated skeleton so the layout never jumps
// when the cost lookup is in flight, and `prefetchOnHover` lets parent
// components warm the cache before the user actually clicks generate.

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCredits, useCreditCost } from "@/hooks/use-credits";
import { isAdminUnlimitedSnapshot } from "@/lib/admin-unlimited";
import { useCreditModals } from "@/components/credits/credit-modals-provider";
import { Coins, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  provider: string | null;
  quality?: string | null;
  durationS?: number | null;
  // Render variant. `compact` for inline rows, `default` for above the
  // generate button, `detail` for surfaces that want the full math.
  compact?: boolean;
  showDetail?: boolean;
  // When true, parent indicates this preview should warm the cost cache
  // so a later real fetch is instant. Used from hover handlers on
  // provider/quality dropdowns.
  prefetchOnHover?: boolean;
  className?: string;
}

export function CreditCost({
  provider, quality, durationS, compact = false, showDetail = false, prefetchOnHover = false, className,
}: Props) {
  const qc = useQueryClient();
  const { data: cost, isLoading } = useCreditCost(provider, quality, durationS);
  const { data: bal } = useCredits();
  const { openTopUp } = useCreditModals();

  useEffect(() => {
    if (!prefetchOnHover || !provider) return;
    qc.prefetchQuery({ queryKey: ["/api/credits/cost", provider, quality, durationS] }).catch(() => {});
  }, [prefetchOnHover, provider, quality, durationS, qc]);

  if (!provider) return null;

  if (isLoading || !cost || !bal) {
    // Skeleton matches the rendered footprint so parent layouts don't
    // shift when data arrives.
    return (
      <div
        data-testid="credit-cost-skeleton"
        className={cn(
          "animate-pulse motion-reduce:animate-none rounded-lg bg-white/5",
          compact ? "h-4 w-16" : showDetail ? "h-20 w-full" : "h-8 w-full",
          className,
        )}
      />
    );
  }

  // Admin-unlimited never goes insufficient, so the cost preview always
  // renders in the "calm" tone with the would-have-been cost shown for
  // visibility — no shortfall, no top-up CTA.
  const isUnlimited = isAdminUnlimitedSnapshot(bal);
  const remaining = isUnlimited ? cost.gcCost : Math.max(0, bal.totalGC - cost.gcCost);
  const insufficient = !isUnlimited && bal.totalGC < cost.gcCost;
  const shortfall = insufficient ? cost.gcCost - bal.totalGC : 0;

  // Admin copy is intentionally distinct from the regular "X GC left"
  // line so the admin doesn't read it as a balance about to be charged.
  if (isUnlimited) {
    return (
      <div
        className={`text-xs flex items-center gap-1.5 text-indigo-300 ${className ?? ""}`}
        data-testid="credit-cost-unlimited"
      >
        <span className="tabular-nums">{cost.gcCost} GC</span>
        <span className="text-muted-foreground">·</span>
        <span>No balance charge (admin)</span>
      </div>
    );
  }

  const tone = insufficient
    ? "text-rose-300"
    : remaining < (bal.monthlyGC || 1) * 0.05
      ? "text-orange-300"
      : remaining < (bal.monthlyGC || 1) * 0.2
        ? "text-amber-300"
        : "text-emerald-300";

  if (compact) {
    return (
      <span
        className={cn("inline-flex items-center gap-1 text-xs font-medium", tone, className)}
        data-testid="credit-cost"
      >
        <Coins className="w-3 h-3" />~{cost.gcCost} GC
      </span>
    );
  }

  if (showDetail) {
    return (
      <div
        className={cn(
          "rounded-lg border p-3 text-xs space-y-1.5",
          insufficient
            ? "border-rose-500/40 bg-gradient-to-br from-rose-950/30 to-rose-900/10"
            : "border-purple-500/15 bg-gradient-to-br from-purple-950/30 to-indigo-950/20",
          className,
        )}
        data-testid="credit-cost-detail"
      >
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Cost to run</span>
          <span className={cn("font-semibold tabular-nums", tone)}>~{cost.gcCost} GC</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Available now</span>
          <span className="font-medium tabular-nums">{bal.totalGC} GC</span>
        </div>
        <div className="flex items-center justify-between pt-1 border-t border-white/5">
          <span className={insufficient ? "text-rose-300" : "text-muted-foreground"}>
            {insufficient ? "Shortfall" : "Remaining after"}
          </span>
          <span className={cn("font-semibold tabular-nums", insufficient ? "text-rose-300" : tone)}>
            {insufficient ? `−${shortfall} GC` : `${remaining} GC`}
          </span>
        </div>
        {insufficient && (
          <button
            onClick={() => openTopUp({ shortfall, required: cost.gcCost, provider: cost.provider })}
            className="mt-1 w-full inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-semibold bg-gradient-to-r from-rose-600 to-rose-700 text-white hover:from-rose-500 hover:to-rose-600"
            data-testid="credit-cost-detail-topup"
          >
            <AlertTriangle className="w-3 h-3" />
            Top up {shortfall} GC to continue
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-purple-500/15 bg-gradient-to-r from-purple-950/30 to-indigo-950/20 text-xs",
        className,
      )}
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
