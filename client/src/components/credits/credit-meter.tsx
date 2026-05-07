// Phase NC-01 + NC-02 — Persistent credit meter for the top app bar.
//
// - Reads server-derived warningLevel/percentUsed/daysUntilReset.
// - Animated count-up on the visible balance (rAF, ~400ms, honors
//   prefers-reduced-motion by snapping straight to the target).
// - Trailing chip is contextual: "Add credits" when warning, "Low" /
//   "Critical" / "Empty" at higher tiers.
// - HoverCard popover shows a richer breakdown.

import { Link } from "wouter";
import { useEffect, useRef, useState } from "react";
import { useCredits } from "@/hooks/use-credits";
import { useCreditModals } from "@/components/credits/credit-modals-provider";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Button } from "@/components/ui/button";
import { Sparkles, ArrowUpRight } from "lucide-react";

const TONE_BAR: Record<string, string> = {
  calm: "from-emerald-400 to-emerald-500",
  warning: "from-amber-300 to-amber-500",
  urgent: "from-orange-400 to-orange-600",
  empty: "from-rose-500 to-red-600",
};
const TONE_TEXT: Record<string, string> = {
  calm: "text-emerald-300",
  warning: "text-amber-300",
  urgent: "text-orange-300",
  empty: "text-rose-300",
};
const CHIP: Record<string, { label: string; tone: string } | null> = {
  calm: null,
  warning: { label: "Low", tone: "bg-amber-500/20 text-amber-200" },
  urgent: { label: "Critical", tone: "bg-orange-500/25 text-orange-100" },
  empty: { label: "Empty", tone: "bg-rose-500/30 text-rose-100" },
};

function useCountUp(target: number, durationMs = 400): number {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced || target === fromRef.current) {
      fromRef.current = target;
      setValue(target);
      return;
    }
    const start = performance.now();
    const from = fromRef.current;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(from + (target - from) * eased));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [target, durationMs]);
  return value;
}

export function CreditMeter() {
  const { data, isLoading } = useCredits();
  const { openTopUp } = useCreditModals();
  const animated = useCountUp(data?.subscriptionGC ?? 0);

  if (isLoading || !data) {
    return <div className="text-xs text-muted-foreground" data-testid="credit-meter-loading">…</div>;
  }
  const level = data.warningLevel ?? "calm";
  const pct = data.percentUsed ?? 0;
  const days = data.daysUntilReset;
  const cycleEnd = data.cycleEnd ? new Date(data.cycleEnd) : null;
  const resetCopy = cycleEnd
    ? days != null && days >= 0
      ? days === 0
        ? "Resets today"
        : days === 1
          ? "Resets tomorrow"
          : `Resets in ${days} days`
      : `Resets ${cycleEnd.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
    : "";
  const chip = CHIP[level];

  return (
    <HoverCard openDelay={120} closeDelay={80}>
      <HoverCardTrigger asChild>
        <Link href="/billing" data-testid="credit-meter-link">
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-gradient-to-br from-purple-950/40 via-indigo-950/30 to-slate-900/60 border-purple-500/20 hover:border-purple-400/40 hover:shadow-[0_0_24px_-8px] hover:shadow-purple-500/40 transition-all cursor-pointer"
          >
            <div className="w-24 h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div
                className={`h-full bg-gradient-to-r ${TONE_BAR[level]} transition-all duration-500 motion-reduce:transition-none`}
                style={{ width: `${Math.max(pct, level === "empty" ? 100 : 4)}%` }}
              />
            </div>
            <span
              className={`text-xs font-medium tabular-nums ${TONE_TEXT[level]}`}
              data-testid="credit-meter-balance"
            >
              {animated} / {data.monthlyGC || 0} GC
            </span>
            {data.topupGC > 0 && (
              <span className="text-[10px] text-purple-300/80 font-medium" data-testid="credit-meter-topup">
                +{data.topupGC}
              </span>
            )}
            {chip && (
              <span
                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${chip.tone}`}
                data-testid="credit-meter-chip"
              >
                {chip.label}
              </span>
            )}
          </div>
        </Link>
      </HoverCardTrigger>
      <HoverCardContent
        side="bottom"
        align="end"
        className="w-72 p-0 border border-purple-500/20 bg-gradient-to-b from-slate-950 to-purple-950/40 backdrop-blur"
      >
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-purple-200 to-indigo-200">
                {data.plan.replace("_", " ")}
              </span>
            </div>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{level}</span>
          </div>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subscription</span>
              <span className="tabular-nums">{data.subscriptionGC} GC</span>
            </div>
            {data.topupGC > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Top-up</span>
                <span className="tabular-nums text-purple-300">+{data.topupGC} GC</span>
              </div>
            )}
            <div className="flex justify-between font-medium pt-1 border-t border-white/5">
              <span>Total available</span>
              <span className="tabular-nums">{data.totalGC} GC</span>
            </div>
            {resetCopy && <div className="text-muted-foreground pt-1">{resetCopy}</div>}
          </div>
          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={() => openTopUp()}
              data-testid="credit-meter-topup-cta"
            >
              Add credits
            </Button>
            <Link href="/billing" className="flex-1">
              <Button
                size="sm"
                className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500"
                data-testid="credit-meter-billing-cta"
              >
                Billing <ArrowUpRight className="w-3 h-3 ml-1" />
              </Button>
            </Link>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
