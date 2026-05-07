// Phase NC-01 + NC-02 — Plans & billing dashboard.
// Four metric tiles, usage-by-provider strip, notifications inbox, and
// the plan comparison grid (deep-linkable via #plan-<TIER>).

import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useCredits } from "@/hooks/use-credits";
import { useCreditNotifications } from "@/hooks/use-credit-notifications";
import { Button } from "@/components/ui/button";
import { TopUpModal } from "@/components/credits/topup-modal";
import { useToast } from "@/hooks/use-toast";
import { Coins, TrendingUp, Calendar, Sparkles, BellRing } from "lucide-react";

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

interface UsageByProviderItem { provider: string | null; consumedGC: number; count: number }

const TONE_BAR: Record<string, string> = {
  calm: "from-emerald-400 to-emerald-500",
  warning: "from-amber-300 to-amber-500",
  urgent: "from-orange-400 to-orange-600",
  empty: "from-rose-500 to-red-600",
};

export default function BillingPage() {
  const { data: snap } = useCredits();
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [period, setPeriod] = useState<"monthly" | "annual">("monthly");
  const [topupOpen, setTopupOpen] = useState(false);
  const [billingConfigured, setBillingConfigured] = useState(true);
  const [usage, setUsage] = useState<UsageByProviderItem[]>([]);
  const { toast } = useToast();
  const { items: notifications, unreadCount, markRead, markAllRead } = useCreditNotifications();

  useEffect(() => {
    fetch("/api/billing/catalog", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        setPlans(d.plans || []);
        setBillingConfigured(d.providerConfigured);
      });
    fetch("/api/credits/usage-by-provider", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setUsage(d.items || []))
      .catch(() => setUsage([]));
    const params = new URLSearchParams(window.location.search);
    if (params.get("topup") === "1") setTopupOpen(true);
    const status = params.get("status");
    if (status === "success") toast({ title: "Subscription activated", description: "Your plan is being provisioned." });
    if (status === "topup_success") toast({ title: "Top-up successful", description: "Credits will arrive momentarily." });
    // Deep-link to a specific plan or the notifications panel. Honor
    // prefers-reduced-motion by jumping instantly instead of animating.
    if (window.location.hash) {
      const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      setTimeout(() => {
        const el = document.querySelector(window.location.hash);
        if (el) el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
      }, 200);
    }
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

  const consumedThisCycle = useMemo(
    () => usage.reduce((sum, u) => sum + (u.consumedGC || 0), 0),
    [usage],
  );
  const topProvider = useMemo(() => {
    if (usage.length === 0) return null;
    return [...usage].sort((a, b) => (b.consumedGC || 0) - (a.consumedGC || 0))[0];
  }, [usage]);
  const maxProviderConsumed = useMemo(
    () => Math.max(1, ...usage.map((u) => u.consumedGC || 0)),
    [usage],
  );

  const level = snap?.warningLevel ?? "calm";
  const pct = snap?.percentUsed ?? 0;
  const days = snap?.daysUntilReset ?? null;

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8" data-testid="billing-page">
      <header className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-200 to-indigo-200">
            Plans & billing
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Generation credits power every AI action. Upgrade, top up, or review usage below.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/profile">
            <Button variant="outline" data-testid="link-profile">Profile</Button>
          </Link>
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

      {/* Phase NC-02 — Four metric tiles */}
      {snap && (
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3" data-testid="billing-metrics">
          <MetricTile
            testId="metric-balance"
            icon={<Coins className="w-4 h-4" />}
            label="Available"
            value={`${snap.totalGC} GC`}
            sub={`Subscription ${snap.subscriptionGC}${snap.topupGC > 0 ? ` · Top-up ${snap.topupGC}` : ""}`}
          >
            {/* Split usage bar: subscription (left, tier-colored) + top-up
                (right, indigo). Width is per-segment share of total GC. */}
            <div
              className="mt-2 flex h-1.5 rounded-full bg-white/10 overflow-hidden"
              data-testid="metric-balance-split"
            >
              {snap.totalGC > 0 ? (
                <>
                  <div
                    className={`h-full bg-gradient-to-r ${TONE_BAR[level]}`}
                    style={{ width: `${Math.round((snap.subscriptionGC / snap.totalGC) * 100)}%` }}
                    data-testid="metric-balance-split-sub"
                  />
                  <div
                    className="h-full bg-gradient-to-r from-purple-400 to-indigo-500"
                    style={{ width: `${Math.round((snap.topupGC / snap.totalGC) * 100)}%` }}
                    data-testid="metric-balance-split-topup"
                  />
                </>
              ) : (
                <div className={`h-full w-full bg-gradient-to-r ${TONE_BAR.empty}`} />
              )}
            </div>
            <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
              <span>Subscription {snap.subscriptionGC}</span>
              <span>Top-up {snap.topupGC}</span>
            </div>
          </MetricTile>
          <MetricTile
            testId="metric-used"
            icon={<TrendingUp className="w-4 h-4" />}
            label="Used this cycle"
            value={`${consumedThisCycle} GC`}
            sub={`${pct}% of plan budget`}
          />
          <MetricTile
            testId="metric-reset"
            icon={<Calendar className="w-4 h-4" />}
            label="Resets"
            value={days != null ? (days === 0 ? "Today" : days === 1 ? "Tomorrow" : `In ${days}d`) : "—"}
            sub={snap.cycleEnd ? new Date(snap.cycleEnd).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : ""}
          />
          <MetricTile
            testId="metric-plan"
            icon={<Sparkles className="w-4 h-4" />}
            label="Plan"
            value={snap.plan.replace("_", " ")}
            sub={`${snap.monthlyGC} GC / month`}
            cta={
              <Button size="sm" onClick={() => setTopupOpen(true)} data-testid="open-topup" className="bg-gradient-to-r from-purple-600 to-indigo-600">
                Buy top-up
              </Button>
            }
          />
        </section>
      )}

      {/* Phase NC-02 — Usage by provider strip */}
      {usage.length > 0 && (
        <section className="p-5 rounded-xl border border-purple-500/15 bg-gradient-to-br from-purple-950/30 via-slate-900/40 to-indigo-950/20" data-testid="usage-by-provider">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm uppercase tracking-wider text-muted-foreground">Usage by provider</h2>
              {topProvider && (
                <p className="text-xs text-muted-foreground mt-1">
                  Top spender: <span className="text-purple-300 font-medium">{topProvider.provider ?? "unknown"}</span> ({topProvider.consumedGC} GC across {topProvider.count} runs)
                </p>
              )}
            </div>
          </div>
          <ul className="space-y-2">
            {usage.map((u) => (
              <li key={u.provider ?? "unknown"} className="grid grid-cols-[140px_1fr_60px] items-center gap-3 text-xs" data-testid={`usage-row-${u.provider ?? "unknown"}`}>
                <span className="truncate font-medium">{u.provider ?? "unknown"}</span>
                <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-purple-500 to-indigo-500"
                    style={{ width: `${Math.round(((u.consumedGC || 0) / maxProviderConsumed) * 100)}%` }}
                  />
                </div>
                <span className="text-right tabular-nums text-muted-foreground">{u.consumedGC} GC</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Phase NC-02 — Plan comparison strip */}
      <section id="plans">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Choose a plan</h2>
          <div className="flex gap-1 p-1 rounded-lg bg-white/5 border border-white/10" data-testid="period-toggle">
            <button
              onClick={() => setPeriod("monthly")}
              className={`px-3 py-1 text-xs rounded ${period === "monthly" ? "bg-gradient-to-r from-purple-600 to-indigo-600 text-white" : "text-muted-foreground"}`}
            >
              Monthly
            </button>
            <button
              onClick={() => setPeriod("annual")}
              className={`px-3 py-1 text-xs rounded ${period === "annual" ? "bg-gradient-to-r from-purple-600 to-indigo-600 text-white" : "text-muted-foreground"}`}
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
                id={`plan-${plan.tier}`}
                className={`p-5 rounded-xl border bg-gradient-to-br from-slate-950/60 to-purple-950/30 flex flex-col transition-all ${
                  isCurrent ? "border-purple-400 shadow-[0_0_24px_-8px] shadow-purple-500/40" : "border-white/10 hover:border-purple-500/30"
                }`}
                data-testid={`plan-${plan.tier}`}
              >
                <div className="font-semibold">{plan.displayName}</div>
                <div className="text-2xl font-bold mt-2">
                  ${(cents / 100).toFixed(0)}
                  <span className="text-sm font-normal text-muted-foreground">/mo</span>
                </div>
                <ul className="text-xs text-muted-foreground space-y-1 mt-3 flex-1">
                  <li>{plan.monthlyGC} GC / month</li>
                  <li>Up to {plan.maxResolution}</li>
                  <li>Up to {plan.maxClipDuration}s clips</li>
                  {plan.rolloverPercent > 0 && <li>{plan.rolloverPercent}% rollover (max {plan.rolloverMax} GC)</li>}
                </ul>
                <Button
                  className={`mt-4 ${isCurrent ? "" : "bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500"}`}
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

      {/* Phase NC-02 — Notifications inbox */}
      <section
        id="notifications"
        className="p-5 rounded-xl border border-purple-500/15 bg-gradient-to-br from-slate-950/60 to-purple-950/20"
        data-testid="notifications-inbox"
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <BellRing className="w-4 h-4 text-purple-300" />
            <h2 className="text-sm uppercase tracking-wider text-muted-foreground">Notifications</h2>
            {unreadCount > 0 && (
              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-rose-500/30 text-rose-200">
                {unreadCount} unread
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              onClick={() => markAllRead()}
              className="text-xs text-purple-300 hover:text-purple-200"
              data-testid="inbox-mark-all-read"
            >
              Mark all read
            </button>
          )}
        </div>
        {notifications.length === 0 ? (
          <p className="text-xs text-muted-foreground" data-testid="inbox-empty">
            No credit notifications yet — we'll let you know when you hit 80%, 95%, 100%, or near your reset date.
          </p>
        ) : (
          <ul className="divide-y divide-white/5">
            {notifications.slice(0, 10).map((n) => (
              <li key={n.id} className={`py-2.5 flex items-start gap-3 text-sm ${n.readAt ? "opacity-60" : ""}`} data-testid={`inbox-row-${n.id}`}>
                <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${n.readAt ? "bg-white/20" : "bg-gradient-to-r from-purple-400 to-indigo-400"}`} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{n.threshold.replace("_", " ")}</div>
                  <div className="text-xs text-muted-foreground">
                    {n.percentUsed != null && `${n.percentUsed}% used · `}
                    {n.remainingGC != null && `${n.remainingGC} GC left · `}
                    {new Date(n.createdAt).toLocaleString()}
                  </div>
                </div>
                {!n.readAt && (
                  <button
                    onClick={() => markRead(n.id)}
                    className="text-xs text-purple-300 hover:text-purple-200"
                    data-testid={`inbox-row-${n.id}-read`}
                  >
                    Mark read
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <TopUpModal open={topupOpen} onOpenChange={setTopupOpen} />
    </div>
  );
}

function MetricTile({
  icon, label, value, sub, cta, children, testId,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  cta?: React.ReactNode;
  children?: React.ReactNode;
  testId: string;
}) {
  return (
    <div
      className="p-4 rounded-xl border border-purple-500/15 bg-gradient-to-br from-slate-950/70 via-purple-950/20 to-indigo-950/20"
      data-testid={testId}
    >
      <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider">
        <span className="text-purple-300">{icon}</span>
        {label}
      </div>
      <div className="mt-1.5 text-xl font-bold tabular-nums">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
      {children}
      {cta && <div className="mt-3">{cta}</div>}
    </div>
  );
}
