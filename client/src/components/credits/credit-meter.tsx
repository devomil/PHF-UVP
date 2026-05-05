// Phase NC-01 — Persistent credit meter for the top app bar.
// Color thresholds: green / yellow at >80% used / orange at >95% / red at 0.

import { Link } from "wouter";
import { useCredits } from "@/hooks/use-credits";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export function CreditMeter() {
  const { data, isLoading } = useCredits();
  if (isLoading || !data) {
    return <div className="text-xs text-muted-foreground" data-testid="credit-meter-loading">…</div>;
  }
  const monthly = data.monthlyGC || 0;
  const used = Math.max(0, monthly - data.subscriptionGC);
  const pct = monthly > 0 ? Math.min(100, Math.round((used / monthly) * 100)) : 0;

  const color = data.totalGC <= 0 ? "bg-red-500" : pct >= 95 ? "bg-orange-500" : pct >= 80 ? "bg-yellow-500" : "bg-emerald-500";
  const textColor = data.totalGC <= 0 ? "text-red-400" : pct >= 95 ? "text-orange-400" : pct >= 80 ? "text-yellow-400" : "text-emerald-400";

  const cycleEnd = data.cycleEnd ? new Date(data.cycleEnd) : null;
  const resetCopy = cycleEnd ? `Resets ${cycleEnd.toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : "";

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Link href="/billing" data-testid="credit-meter-link">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 cursor-pointer">
              <div className="w-20 h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
              </div>
              <span className={`text-xs font-medium ${textColor}`} data-testid="credit-meter-balance">
                {data.subscriptionGC} / {monthly} GC
              </span>
              {data.topupGC > 0 && (
                <span className="text-[10px] text-muted-foreground" data-testid="credit-meter-topup">
                  +{data.topupGC}
                </span>
              )}
            </div>
          </Link>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-xs space-y-1">
            <div>Plan: <span className="font-medium">{data.plan}</span></div>
            <div>Subscription: {data.subscriptionGC} GC</div>
            {data.topupGC > 0 && <div>Top-up: {data.topupGC} GC</div>}
            <div>Total: {data.totalGC} GC</div>
            {resetCopy && <div className="text-muted-foreground">{resetCopy}</div>}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
