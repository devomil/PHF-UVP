// Phase NC-01 — Plans & billing page.
// Lists subscription plans, top-up packs, current plan + usage, and an
// entry point to Stripe's customer portal once a customer exists.

import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useCredits } from "@/hooks/use-credits";
import { Button } from "@/components/ui/button";
import { TopUpModal } from "@/components/credits/topup-modal";
import { useToast } from "@/hooks/use-toast";

interface PlanRow {
  tier: "STARTER" | "GROWTH" | "STUDIO" | "ENTERPRISE";
  displayName: string;
  monthlyGC: number;
  monthlyPriceCents: number;
  annualPriceCents: number;
  rolloverPercent: number;
  rolloverMax: number;
  maxResolution: string;
  maxClipDuration: number;
  monthlyConfigured: boolean;
  annualConfigured: boolean;
}

export default function BillingPage() {
  const [, setLocation] = useLocation();
  const { data: snap } = useCredits();
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [period, setPeriod] = useState<"monthly" | "annual">("monthly");
  const [topupOpen, setTopupOpen] = useState(false);
  const [billingConfigured, setBillingConfigured] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetch("/api/billing/catalog", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        setPlans(d.plans || []);
        setBillingConfigured(d.providerConfigured);
      });
    const params = new URLSearchParams(window.location.search);
    if (params.get("topup") === "1") setTopupOpen(true);
    const status = params.get("status");
    if (status === "success") toast({ title: "Subscription activated", description: "Your plan is being provisioned." });
    if (status === "topup_success") toast({ title: "Top-up successful", description: "Credits will arrive momentarily." });
  }, []);

  async function startUpgrade(tier: PlanRow["tier"]) {
    try {
      const res = await fetch("/api/subscriptions/upgrade-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ plan: tier, period }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === "BILLING_NOT_CONFIGURED") {
          toast({ title: "Plan not yet available", description: "This tier is being configured — check back shortly.", variant: "destructive" });
        } else {
          toast({ title: "Checkout failed", description: data.error, variant: "destructive" });
        }
        return;
      }
      window.location.href = data.url;
    } catch (e: any) {
      toast({ title: "Network error", description: e.message, variant: "destructive" });
    }
  }

  async function openPortal() {
    const res = await fetch("/api/subscriptions/portal", { method: "POST", credentials: "include" });
    const data = await res.json();
    if (!res.ok) {
      toast({ title: "Couldn't open portal", description: data.error, variant: "destructive" });
      return;
    }
    window.location.href = data.url;
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8" data-testid="billing-page">
      <header className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold">Plans & billing</h1>
          <p className="text-sm text-muted-foreground mt-1">Generation credits power every AI action. Upgrade or top up below.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/billing/transactions">
            <Button variant="outline" data-testid="link-transactions">Transaction history</Button>
          </Link>
          <Button variant="outline" onClick={openPortal} data-testid="open-portal">Manage subscription</Button>
        </div>
      </header>

      {!billingConfigured && (
        <div className="p-4 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-200 text-sm" data-testid="billing-notconfigured">
          Billing is being configured. Pricing is final but checkout is temporarily unavailable.
        </div>
      )}

      {snap && (
        <section className="p-5 rounded-xl border border-white/10 bg-white/5">
          <h2 className="text-sm uppercase tracking-wider text-muted-foreground mb-2">Current usage</h2>
          <div className="flex justify-between items-end">
            <div>
              <div className="text-2xl font-bold" data-testid="current-balance">{snap.totalGC} GC</div>
              <div className="text-sm text-muted-foreground">
                Plan: <span className="font-medium">{snap.plan}</span> · Subscription {snap.subscriptionGC} / {snap.monthlyGC}
                {snap.topupGC > 0 && ` · Top-up ${snap.topupGC}`}
              </div>
            </div>
            <Button onClick={() => setTopupOpen(true)} data-testid="open-topup">Buy top-up credits</Button>
          </div>
        </section>
      )}

      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Choose a plan</h2>
          <div className="flex gap-1 p-1 rounded-lg bg-white/5 border border-white/10" data-testid="period-toggle">
            <button
              onClick={() => setPeriod("monthly")}
              className={`px-3 py-1 text-xs rounded ${period === "monthly" ? "bg-purple-600 text-white" : "text-muted-foreground"}`}
            >
              Monthly
            </button>
            <button
              onClick={() => setPeriod("annual")}
              className={`px-3 py-1 text-xs rounded ${period === "annual" ? "bg-purple-600 text-white" : "text-muted-foreground"}`}
            >
              Annual (save ~17%)
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {plans.map((plan) => {
            const cents = period === "annual" ? Math.round(plan.annualPriceCents / 12) : plan.monthlyPriceCents;
            const configured = period === "annual" ? plan.annualConfigured : plan.monthlyConfigured;
            const isCurrent = snap?.plan === plan.tier;
            return (
              <div
                key={plan.tier}
                className={`p-5 rounded-xl border ${isCurrent ? "border-purple-500" : "border-white/10"} bg-white/5 flex flex-col`}
                data-testid={`plan-${plan.tier}`}
              >
                <div className="font-semibold">{plan.displayName}</div>
                <div className="text-2xl font-bold mt-2">${(cents / 100).toFixed(0)}<span className="text-sm font-normal text-muted-foreground">/mo</span></div>
                <ul className="text-xs text-muted-foreground space-y-1 mt-3 flex-1">
                  <li>{plan.monthlyGC} GC / month</li>
                  <li>Up to {plan.maxResolution}</li>
                  <li>Up to {plan.maxClipDuration}s clips</li>
                  {plan.rolloverPercent > 0 && <li>{plan.rolloverPercent}% rollover (max {plan.rolloverMax} GC)</li>}
                </ul>
                <Button
                  className="mt-4"
                  onClick={() => startUpgrade(plan.tier)}
                  disabled={!configured || isCurrent}
                  data-testid={`upgrade-${plan.tier}`}
                  variant={isCurrent ? "outline" : "default"}
                >
                  {isCurrent ? "Current plan" : !configured ? "Coming soon" : "Upgrade"}
                </Button>
              </div>
            );
          })}
        </div>
      </section>

      <TopUpModal open={topupOpen} onOpenChange={setTopupOpen} />
    </div>
  );
}
