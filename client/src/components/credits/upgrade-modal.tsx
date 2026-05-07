// Phase NC-02 — Upgrade modal opened by the global CreditModalsProvider
// when a generation is blocked by a provider-plan lock (or whenever the
// user explicitly asks to upgrade from inside the credit UI).
//
// Renders the candidate plans with the required tier highlighted and a
// CTA that kicks off the Stripe checkout flow. A footer link still goes
// to /billing for users who want the full comparison page — that path
// previously was the *only* way to upgrade, which the spec called out
// as a regression.

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Check, Lock, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface PlanRow {
  tier: "STARTER" | "GROWTH" | "STUDIO" | "ENTERPRISE";
  displayName: string;
  monthlyGC: number;
  monthlyPriceCents: number;
  configured: boolean;
}

interface UpgradeContext {
  provider?: string | null;
  requiredPlan?: string | null;
  currentPlan?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context?: UpgradeContext;
}

const TIER_ORDER = ["STARTER", "GROWTH", "STUDIO", "ENTERPRISE"] as const;

export function UpgradeModal({ open, onOpenChange, context }: Props) {
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [selected, setSelected] = useState<PlanRow["tier"] | null>(null);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;
    fetch("/api/billing/catalog", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        const rows: PlanRow[] = (d.plans || []).filter((p: PlanRow) => p.tier !== "FREE_TRIAL");
        setPlans(rows);
        const requiredIdx = context?.requiredPlan ? TIER_ORDER.indexOf(context.requiredPlan as any) : -1;
        const candidate = requiredIdx >= 0 ? rows.find((p) => p.tier === context?.requiredPlan) : rows[0];
        setSelected((candidate ?? rows[0])?.tier ?? null);
      });
  }, [open, context?.requiredPlan]);

  async function startCheckout() {
    if (!selected) return;
    setBusy(true);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ tier: selected, billingCycle: "monthly" }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Couldn't start upgrade", description: data.error, variant: "destructive" });
        return;
      }
      window.location.href = data.url;
    } catch (e: any) {
      toast({ title: "Network error", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="upgrade-modal"
        className="max-w-2xl border-purple-500/20 bg-gradient-to-b from-slate-950 to-purple-950/40"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-purple-400" />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-purple-200 to-indigo-200">
              {context?.provider ? `Unlock ${context.provider}` : "Upgrade your plan"}
            </span>
          </DialogTitle>
          <DialogDescription>
            {context?.provider && context?.requiredPlan ? (
              <>
                <span className="text-foreground font-medium">{context.provider}</span>{" "}
                is available starting on the{" "}
                <span className="text-foreground font-medium">{context.requiredPlan}</span>{" "}
                plan
                {context.currentPlan ? <> — you're on {context.currentPlan} today.</> : <>.</>}
              </>
            ) : (
              "Pick a plan to unlock more providers and a larger monthly credit budget."
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 py-2" data-testid="upgrade-plan-grid">
          {plans.map((plan) => {
            const isSelected = selected === plan.tier;
            const isRecommended = context?.requiredPlan === plan.tier;
            return (
              <button
                key={plan.tier}
                onClick={() => plan.configured && setSelected(plan.tier)}
                disabled={!plan.configured}
                data-testid={`upgrade-plan-${plan.tier}`}
                className={cn(
                  "relative text-left p-3 rounded-lg border transition-all",
                  isSelected
                    ? "border-purple-400 bg-purple-500/15 shadow-[0_0_24px_-8px] shadow-purple-500/40"
                    : "border-white/10 hover:border-purple-500/40",
                  !plan.configured && "opacity-50 cursor-not-allowed",
                )}
              >
                {isRecommended && (
                  <span
                    className="absolute -top-2 right-3 text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-gradient-to-r from-purple-600 to-indigo-600 text-white"
                    data-testid={`upgrade-plan-${plan.tier}-recommended`}
                  >
                    Required
                  </span>
                )}
                <div className="flex justify-between items-baseline">
                  <div>
                    <div className="font-semibold flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-purple-300" />
                      {plan.displayName}
                    </div>
                    <div className="text-xs text-muted-foreground">{plan.monthlyGC} GC / month</div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold tabular-nums">${(plan.monthlyPriceCents / 100).toFixed(0)}</div>
                    <div className="text-[10px] text-muted-foreground">/ month</div>
                  </div>
                </div>
                {isSelected && (
                  <div className="mt-2 text-[10px] text-purple-300 flex items-center gap-1">
                    <Check className="w-3 h-3" /> Selected
                  </div>
                )}
                {!plan.configured && <div className="text-[10px] text-amber-400 mt-1">Coming soon</div>}
              </button>
            );
          })}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0 sm:justify-between items-stretch sm:items-center">
          <Link
            href="/pricing"
            onClick={() => onOpenChange(false)}
            className="text-xs text-purple-300 hover:text-purple-200 underline-offset-2 hover:underline"
            data-testid="upgrade-compare-link"
          >
            Compare plans →
          </Link>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="upgrade-cancel">
              Not now
            </Button>
            <Button
              onClick={startCheckout}
              disabled={!selected || busy}
              data-testid="upgrade-checkout"
              className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500"
            >
              {busy ? "Opening checkout…" : "Upgrade now"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
