// Phase NC-03 — Public pricing page.
//
// Every price, GC budget, pack size, badge, overage rate, and provider
// gating row is derived from server config via usePublicPricing(). No
// duplicated numbers in JSX. Auth-aware CTAs route through the shared
// checkout-launcher helper. configured:false → "Contact us" CTA.

import { Fragment, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowRight, Check, X, Sparkles, ShieldCheck, Coins, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { usePublicPricing, type PublicPlan, type PublicTopUpPack, type PublicGenerationRates } from "@/hooks/use-public-pricing";
import { launchPlanCheckout, launchTopUpCheckout } from "@/lib/checkout-launcher";
import { VIDEO_PROVIDER_CATALOG } from "@shared/provider-catalog";
import { CURATED_PRICING_PROVIDER_ROWS, PRICING_TIER_DESCRIPTIONS } from "@shared/config/pricing-provider-rows";
import neuralcutFullLogo from "@/assets/neuralcut-full-logo.png";

const FAQS = [
  { q: "What's a Generation Credit (GC)?", a: "A Generation Credit is the unit of work for every AI action on NeuralCut — generating an image, animating a clip, rendering a voiceover, or composing a final video. Different models cost different amounts of GC so you always know what you're spending before you click Generate." },
  { q: "How do GC differ from tokens?", a: "Tokens scale with how many words a model processes, which makes costs unpredictable. GC are flat per generation: a 5-second clip from Kling 2.6 always costs the same number of credits, no matter the prompt." },
  { q: "Do unused credits roll over?", a: "Subscription credits roll over up to a per-plan cap (Growth: 25%, Studio: 50%, Enterprise: 100%). Top-up credits never expire and are consumed after subscription credits each cycle." },
  { q: "What happens if I run out mid-month?", a: "You can buy a top-up pack at any time, or your overage is metered at your plan's per-GC rate. We'll warn you at 80%, 95%, and 100% so there are no surprises." },
  { q: "Can I change plans?", a: "Yes — upgrade or downgrade at any time from your billing dashboard. Changes prorate automatically and take effect immediately." },
  { q: "Do you offer a free trial?", a: "Every account starts with a 14-day free trial — no credit card required. You'll have GC to evaluate every Standard-tier model." },
  { q: "Is there an annual discount?", a: "Yes. Annual billing saves roughly 17% compared to paying monthly, and the savings are shown directly on each plan card when you toggle Annual." },
  { q: "What about taxes?", a: "Prices shown are in USD. VAT, GST, and other regional taxes may apply at checkout depending on your billing address." },
];

const TRUST_PILLS = [
  "14-day free trial",
  "No credit card to start",
  "No token costs",
];

export default function PricingPage() {
  const { isAuthenticated } = useAuth();
  const { plans, topupPacks, generationRates, providerConfigured, isLoading } = usePublicPricing();
  const [period, setPeriod] = useState<"monthly" | "annual">("monthly");
  const [showAllProviders, setShowAllProviders] = useState(false);
  const [, navigate] = useLocation();
  const { toast } = useToast();

  // SEO + structured data
  useEffect(() => {
    document.title = "Pricing — NeuralCut.AI | Predictable AI video credits";
    setMeta("description", "Predictable, per-generation pricing. No token shock. Three plans, transparent credit budgets, and 60+ AI video models.");
    setLink("canonical", `${window.location.origin}/pricing`);
    setMeta("og:title", "Pricing — NeuralCut.AI", "property");
    setMeta("og:description", "Predictable AI video credits. No token shock.", "property");
    setMeta("og:type", "website", "property");
    setMeta("og:url", `${window.location.origin}/pricing`, "property");
    const ogImage = `${window.location.origin}/og-pricing.png`;
    setMeta("og:image", ogImage, "property");
    setMeta("og:image:alt", "NeuralCut.AI pricing — predictable AI video credits", "property");
    setMeta("twitter:card", "summary_large_image");
    setMeta("twitter:title", "Pricing — NeuralCut.AI");
    setMeta("twitter:description", "Predictable AI video credits. No token shock.");
    setMeta("twitter:image", ogImage);
    setMeta("twitter:image:alt", "NeuralCut.AI pricing — predictable AI video credits");
  }, []);

  // JSON-LD: Product+Offer per plan + FAQPage
  const jsonLd = useMemo(() => {
    if (plans.length === 0) return null;
    const products = plans.map((p) => ({
      "@context": "https://schema.org",
      "@type": "Product",
      name: `NeuralCut.AI ${p.displayName}`,
      description: p.marketingClaims.tagline,
      brand: { "@type": "Brand", name: "NeuralCut.AI" },
      offers: {
        "@type": "Offer",
        priceCurrency: "USD",
        price: (p.monthlyPriceCents / 100).toFixed(2),
        priceSpecification: {
          "@type": "UnitPriceSpecification",
          price: (p.monthlyPriceCents / 100).toFixed(2),
          priceCurrency: "USD",
          unitText: "MONTH",
        },
        availability: p.monthlyConfigured ? "https://schema.org/InStock" : "https://schema.org/PreOrder",
      },
    }));
    const faq = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: FAQS.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    };
    return JSON.stringify([...products, faq]);
  }, [plans]);

  async function handlePlanCta(plan: PublicPlan) {
    const catalogKey = period === "annual" ? plan.catalogKeyAnnual : plan.catalogKeyMonthly;
    const configured = period === "annual" ? plan.annualConfigured : plan.monthlyConfigured;
    if (!configured) {
      navigate(`/contact-sales?plan=${plan.tier}`);
      return;
    }
    const result = await launchPlanCheckout({
      isAuthenticated,
      catalogKey,
      tier: plan.tier,
      period,
    });
    if (!result.ok) {
      if (result.code === "BILLING_NOT_CONFIGURED") {
        navigate(`/contact-sales?plan=${plan.tier}`);
      } else {
        toast({ title: "Couldn't open checkout", description: result.error, variant: "destructive" });
      }
      return;
    }
    window.location.href = result.url;
  }

  async function handleTopupCta(pack: PublicTopUpPack) {
    if (!pack.configured) {
      navigate(`/contact-sales?topup=${pack.id}`);
      return;
    }
    const result = await launchTopUpCheckout({
      isAuthenticated,
      packId: pack.id,
      catalogKey: pack.catalogKey,
    });
    if (!result.ok) {
      toast({ title: "Couldn't open checkout", description: result.error, variant: "destructive" });
      return;
    }
    window.location.href = result.url;
  }

  // Build provider matrix (curated + full)
  const catalogById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of VIDEO_PROVIDER_CATALOG) m.set(p.id, p.name);
    return m;
  }, []);

  const fullProviderRows = useMemo(() => {
    const ids = new Set<string>();
    for (const p of plans) for (const id of p.providerIds) ids.add(id);
    return Array.from(ids).map((id) => ({
      id,
      displayName: catalogById.get(id) ?? id,
    }));
  }, [plans, catalogById]);

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--surface-base, #09090f)" }}>
      <a
        href="#pricing-plans"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 px-3 py-2 rounded bg-purple-600 text-white"
      >
        Skip to pricing
      </a>
      {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />}

      <PricingNav />

      <main role="main" className="text-white">
        {/* Hero */}
        <section className="relative pt-32 pb-12 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-purple-900/20 via-transparent to-transparent" />
          <div className="relative z-10 max-w-5xl mx-auto px-6 text-center">
            <h1 className="text-4xl md:text-6xl font-bold mb-4 bg-gradient-to-r from-white via-purple-200 to-indigo-200 bg-clip-text text-transparent">
              Predictable pricing. No token shock.
            </h1>
            <p className="text-lg max-w-2xl mx-auto mb-8" style={{ color: "var(--text-secondary, #94a3b8)" }}>
              Every AI action on NeuralCut costs a fixed number of Generation Credits. You always know what
              you're spending — before you click Generate.
            </p>
            <div className="flex items-center justify-center gap-3 flex-wrap mb-8" data-testid="trust-pills">
              {TRUST_PILLS.map((pill) => (
                <span
                  key={pill}
                  className="px-3 py-1.5 rounded-full text-xs font-medium"
                  style={{
                    backgroundColor: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    color: "var(--text-secondary, #94a3b8)",
                  }}
                >
                  <Check className="inline-block w-3.5 h-3.5 mr-1 text-emerald-400" />
                  {pill}
                </span>
              ))}
            </div>

            <PeriodToggle period={period} setPeriod={setPeriod} />
            {!providerConfigured && (
              <p className="mt-4 text-xs text-amber-300" data-testid="billing-not-configured-banner">
                Checkout is being configured. CTAs will route to "Contact us" until Stripe is fully wired.
              </p>
            )}
          </div>
        </section>

        {/* Plan cards */}
        <section id="pricing-plans" className="max-w-7xl mx-auto px-6 pb-12" aria-labelledby="plans-heading">
          <h2 id="plans-heading" className="sr-only">Subscription plans</h2>
          {isLoading ? (
            <div className="text-center text-sm text-muted-foreground" data-testid="plans-loading">Loading plans…</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {plans
                .filter((p) => p.tier !== "ENTERPRISE")
                .map((plan) => (
                  <PlanCard
                    key={plan.tier}
                    plan={plan}
                    period={period}
                    onCta={() => handlePlanCta(plan)}
                  />
                ))}
              <EnterpriseCard
                plan={plans.find((p) => p.tier === "ENTERPRISE")}
                onCta={() => navigate("/contact-sales?plan=ENTERPRISE")}
              />
            </div>
          )}
        </section>

        {/* GC explainer */}
        <GCExplainer rates={generationRates} />

        {/* Top-up packs */}
        <TopUpPacksSection topupPacks={topupPacks} onCta={handleTopupCta} />

        {/* Provider matrix */}
        <ProviderMatrix
          plans={plans}
          showAll={showAllProviders}
          setShowAll={setShowAllProviders}
          fullRows={fullProviderRows}
        />

        {/* FAQ */}
        <section className="max-w-3xl mx-auto px-6 py-16" aria-labelledby="faq-heading">
          <h2 id="faq-heading" className="text-3xl font-bold text-center mb-8 bg-gradient-to-r from-white to-purple-200 bg-clip-text text-transparent">
            Frequently asked questions
          </h2>
          <Accordion type="single" collapsible className="space-y-2" data-testid="faq-accordion">
            {FAQS.map((f, i) => (
              <AccordionItem
                key={i}
                value={`faq-${i}`}
                className="rounded-lg border px-4"
                style={{ borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(255,255,255,0.02)" }}
              >
                <AccordionTrigger className="text-left text-sm md:text-base font-medium" data-testid={`faq-q-${i}`}>
                  {f.q}
                </AccordionTrigger>
                <AccordionContent className="text-sm" style={{ color: "var(--text-secondary, #94a3b8)" }}>
                  {f.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        {/* Final CTA */}
        <section className="relative py-20 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-purple-900/10 to-transparent" />
          <div className="relative z-10 max-w-3xl mx-auto px-6 text-center">
            <h2 className="text-3xl md:text-4xl font-bold mb-4 bg-gradient-to-r from-white to-purple-200 bg-clip-text text-transparent">
              Start creating in minutes.
            </h2>
            <p className="text-base mb-8 max-w-xl mx-auto" style={{ color: "var(--text-secondary, #94a3b8)" }}>
              Spin up a free account, pick a model, and ship your first AI video today. VAT may apply at checkout.
            </p>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <Link href={isAuthenticated ? "/projects/new" : "/auth?next=/projects/new"}>
                <Button
                  size="lg"
                  className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white px-8 py-4 text-base rounded-xl h-auto shadow-xl shadow-purple-600/20"
                  data-testid="final-cta-trial"
                >
                  Start free trial
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Link href="/contact-sales">
                <Button
                  size="lg"
                  variant="outline"
                  className="px-8 py-4 text-base rounded-xl h-auto"
                  data-testid="final-cta-sales"
                >
                  <Phone className="mr-2 h-4 w-4" />
                  Talk to sales
                </Button>
              </Link>
            </div>
          </div>
        </section>

        <PricingFooter />
      </main>
    </div>
  );
}

// ===== Subcomponents =====

function PeriodToggle({ period, setPeriod }: { period: "monthly" | "annual"; setPeriod: (p: "monthly" | "annual") => void }) {
  return (
    <div
      role="radiogroup"
      aria-label="Billing period"
      className="inline-flex gap-1 p-1 rounded-lg bg-white/5 border border-white/10"
      data-testid="period-toggle"
    >
      {(["monthly", "annual"] as const).map((p) => (
        <button
          key={p}
          role="radio"
          aria-checked={period === p}
          tabIndex={period === p ? 0 : -1}
          onClick={() => setPeriod(p)}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
              e.preventDefault();
              setPeriod(p === "monthly" ? "annual" : "monthly");
            }
          }}
          className={`px-4 py-2 text-sm rounded transition-colors motion-reduce:transition-none ${
            period === p ? "bg-gradient-to-r from-purple-600 to-indigo-600 text-white" : "text-slate-300 hover:text-white"
          }`}
          data-testid={`period-${p}`}
        >
          {p === "monthly" ? "Monthly" : "Annual (save ~17%)"}
        </button>
      ))}
    </div>
  );
}

function PlanCard({
  plan,
  period,
  onCta,
}: {
  plan: PublicPlan;
  period: "monthly" | "annual";
  onCta: () => void;
}) {
  const cents = period === "annual" ? plan.annualMonthlyCents : plan.monthlyPriceCents;
  const configured = period === "annual" ? plan.annualConfigured : plan.monthlyConfigured;
  const featured = plan.tier === "GROWTH";
  const dollars = (cents / 100).toFixed(0);
  const annualSavings = plan.annualSavingsCents > 0 ? `$${Math.round(plan.annualSavingsCents / 100)}/year` : null;

  return (
    <div
      data-testid={`pricing-plan-${plan.tier}`}
      data-tier={plan.tier}
      className={`relative p-6 rounded-2xl border flex flex-col bg-gradient-to-br from-slate-950/80 to-purple-950/30 transition-all motion-reduce:transition-none ${
        featured
          ? "border-purple-400 shadow-[0_0_40px_-10px] shadow-purple-500/40"
          : "border-white/10 hover:border-purple-500/40"
      }`}
    >
      {featured && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] uppercase tracking-wider font-bold px-3 py-1 rounded-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white">
          Most popular
        </span>
      )}
      <div>
        <h3 className="font-semibold text-lg flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-purple-300" />
          {plan.displayName}
        </h3>
        <p className="text-xs mt-1" style={{ color: "var(--text-muted, #64748b)" }}>
          {plan.marketingClaims.tagline}
        </p>
      </div>
      <div className="mt-4">
        <span className="text-4xl font-bold tabular-nums" data-testid={`pricing-plan-${plan.tier}-price`}>
          ${dollars}
        </span>
        <span className="text-sm font-normal text-muted-foreground">/mo</span>
      </div>
      {period === "annual" && (
        <p className="text-xs mt-1" data-testid={`pricing-plan-${plan.tier}-annual-info`}>
          <span style={{ color: "var(--text-muted, #64748b)" }}>
            ${(plan.annualPriceCents / 100).toFixed(0)} billed yearly
          </span>
          {annualSavings && (
            <span className="ml-2 text-emerald-300">Save {annualSavings}</span>
          )}
        </p>
      )}

      <ul className="mt-4 space-y-2 text-sm flex-1" style={{ color: "var(--text-secondary, #cbd5e1)" }}>
        <FeatureLi>
          <strong className="text-white">{plan.monthlyGC.toLocaleString()} GC</strong> per month
        </FeatureLi>
        {plan.rolloverPercent > 0 && (
          <FeatureLi>
            {plan.rolloverPercent}% rollover (max {plan.rolloverMax} GC)
          </FeatureLi>
        )}
        <FeatureLi>Up to {plan.maxResolution} renders</FeatureLi>
        <FeatureLi>Up to {plan.maxClipDuration}s per clip</FeatureLi>
        <FeatureLi>Overage: {plan.overageRateCents}¢ / GC</FeatureLi>
        <FeatureLi>
          {plan.marketingClaims.seats === "unlimited" ? "Unlimited seats" : `${plan.marketingClaims.seats} seat${plan.marketingClaims.seats === 1 ? "" : "s"}`}
        </FeatureLi>
        <FeatureLi>
          {plan.marketingClaims.brandWorkspaces === "unlimited"
            ? "Unlimited brand workspaces"
            : `${plan.marketingClaims.brandWorkspaces} brand workspace${plan.marketingClaims.brandWorkspaces === 1 ? "" : "s"}`}
        </FeatureLi>
        {plan.marketingClaims.prioritySupport && <FeatureLi>Priority support</FeatureLi>}
        {plan.marketingClaims.apiAccess && <FeatureLi>API access</FeatureLi>}
      </ul>

      <Button
        onClick={onCta}
        data-testid={`pricing-plan-${plan.tier}-cta`}
        className={`mt-6 ${featured ? "bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500" : ""}`}
        variant={featured ? "default" : "outline"}
      >
        {configured ? `Choose ${plan.displayName}` : "Contact us"}
      </Button>
    </div>
  );
}

function EnterpriseCard({ plan, onCta }: { plan?: PublicPlan; onCta: () => void }) {
  return (
    <div
      data-testid="pricing-plan-ENTERPRISE"
      data-tier="ENTERPRISE"
      className="relative p-6 rounded-2xl border border-white/10 hover:border-purple-500/40 flex flex-col bg-gradient-to-br from-slate-950/80 to-indigo-950/30 transition-all motion-reduce:transition-none"
    >
      <h3 className="font-semibold text-lg flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-indigo-300" />
        Enterprise
      </h3>
      <p className="text-xs mt-1" style={{ color: "var(--text-muted, #64748b)" }}>
        For agencies and teams with custom needs.
      </p>
      <div className="mt-4">
        <span className="text-3xl font-bold">Custom</span>
      </div>
      <ul className="mt-4 space-y-2 text-sm flex-1" style={{ color: "var(--text-secondary, #cbd5e1)" }}>
        {plan && (
          <>
            <FeatureLi>From {plan.monthlyGC.toLocaleString()} GC / month</FeatureLi>
            <FeatureLi>{plan.rolloverPercent}% rollover (max {plan.rolloverMax} GC)</FeatureLi>
            <FeatureLi>Up to {plan.maxResolution} renders</FeatureLi>
          </>
        )}
        <FeatureLi>Unlimited seats &amp; workspaces</FeatureLi>
        <FeatureLi>SSO, custom contracts, dedicated CSM</FeatureLi>
        <FeatureLi>Priority support &amp; API access</FeatureLi>
      </ul>
      <Button
        onClick={onCta}
        data-testid="pricing-plan-ENTERPRISE-cta"
        className="mt-6 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500"
      >
        Talk to sales
      </Button>
    </div>
  );
}

function FeatureLi({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
      <span>{children}</span>
    </li>
  );
}

function GCExplainer({ rates }: { rates: PublicGenerationRates | null }) {
  // Tier ranges and the worked example are sourced live from
  // `/api/billing/generation-rates`, which aggregates active rows in the
  // generation_rates table. Falls back to descriptive blurbs only.
  const tierOrder = ["Standard", "Premium", "Top-tier"] as const;
  return (
    <section className="max-w-5xl mx-auto px-6 py-16" aria-labelledby="gc-heading">
      <div className="text-center mb-10">
        <h2 id="gc-heading" className="text-3xl font-bold mb-3 bg-gradient-to-r from-white to-purple-200 bg-clip-text text-transparent">
          What are Generation Credits?
        </h2>
        <p className="max-w-2xl mx-auto text-sm" style={{ color: "var(--text-secondary, #94a3b8)" }}>
          One credit = one AI action. Models are tiered by output quality and runtime cost.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {tierOrder.map((tier) => {
          const meta = PRICING_TIER_DESCRIPTIONS[tier];
          const r = rates?.tiers[tier];
          const range = r ? `${r.min}–${r.max} GC / clip` : "—";
          return (
            <div
              key={tier}
              className="p-5 rounded-xl border border-white/10 bg-gradient-to-br from-slate-950/80 to-purple-950/20"
              data-testid={`gc-tier-${tier}`}
            >
              <div className="flex items-center gap-2 text-purple-300 text-xs uppercase tracking-wider">
                <Coins className="w-3.5 h-3.5" />
                {tier}
              </div>
              <div className="text-xl font-bold mt-2" data-testid={`gc-tier-${tier}-range`}>{range}</div>
              <p className="text-sm mt-2" style={{ color: "var(--text-secondary, #94a3b8)" }}>{meta.blurb}</p>
            </div>
          );
        })}
      </div>
      {rates?.example && (
        <div
          className="mt-6 p-5 rounded-xl border border-purple-500/20 bg-gradient-to-br from-purple-950/30 to-indigo-950/20 text-sm"
          style={{ color: "var(--text-secondary, #cbd5e1)" }}
          data-testid="gc-example"
        >
          <strong className="text-white">Example:</strong>{" "}
          A {rates.example.videoDurationS}-second video on the Growth plan — {rates.example.clipsPerVideo}{" "}
          {rates.example.clipDurationS}-second Premium clips at ~{rates.example.premiumGCPerClip} GC each — runs about{" "}
          {rates.example.gcPerVideo} GC. With a {rates.example.planMonthlyGC} GC budget, that's roughly{" "}
          {rates.example.videosPerBudget} videos per month before you'd top up.
        </div>
      )}
    </section>
  );
}

function TopUpPacksSection({
  topupPacks,
  onCta,
}: {
  topupPacks: PublicTopUpPack[];
  onCta: (pack: PublicTopUpPack) => void;
}) {
  if (topupPacks.length === 0) return null;
  return (
    <section className="max-w-5xl mx-auto px-6 py-16" aria-labelledby="topup-heading">
      <div className="text-center mb-8">
        <h2 id="topup-heading" className="text-3xl font-bold mb-3 bg-gradient-to-r from-white to-purple-200 bg-clip-text text-transparent">
          Top-up packs
        </h2>
        <p className="text-sm max-w-2xl mx-auto" style={{ color: "var(--text-secondary, #94a3b8)" }}>
          Buy extra credits anytime. Top-ups never expire and are consumed after your subscription credits.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3" data-testid="topup-grid">
        {topupPacks.map((pack) => (
          <div
            key={pack.id}
            data-testid={`topup-pack-${pack.id}`}
            className="relative p-5 rounded-xl border border-white/10 hover:border-purple-500/40 flex items-center justify-between bg-gradient-to-br from-slate-950/80 to-purple-950/20 transition-all motion-reduce:transition-none"
          >
            {pack.badge && (
              <span
                className={`absolute -top-2 right-4 text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded ${
                  pack.badge === "BEST VALUE"
                    ? "bg-gradient-to-r from-emerald-600 to-teal-500 text-white"
                    : "bg-gradient-to-r from-purple-600 to-indigo-600 text-white"
                }`}
                data-testid={`topup-pack-${pack.id}-badge`}
              >
                {pack.badge}
              </span>
            )}
            <div>
              <div className="font-semibold text-lg">{pack.gc.toLocaleString()} GC</div>
              <div className="text-xs" style={{ color: "var(--text-muted, #64748b)" }}>
                ${(pack.priceCents / 100).toFixed(0)} · ${(pack.priceCents / 100 / pack.gc).toFixed(3)} per GC
              </div>
            </div>
            <Button
              onClick={() => onCta(pack)}
              data-testid={`topup-pack-${pack.id}-cta`}
              className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500"
            >
              {pack.configured ? "Buy credits" : "Contact us"}
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}

function ProviderMatrix({
  plans,
  showAll,
  setShowAll,
  fullRows,
}: {
  plans: PublicPlan[];
  showAll: boolean;
  setShowAll: (b: boolean) => void;
  fullRows: { id: string; displayName: string }[];
}) {
  const tierPlans = plans.filter((p) => p.tier !== "ENTERPRISE");
  const planAllows = (planTier: string, providerId: string) => {
    const plan = plans.find((p) => p.tier === planTier);
    return plan ? plan.providerIds.includes(providerId) : false;
  };
  type MatrixRow = { id: string; displayName: string; tier: "Standard" | "Premium" | "Top-tier" };
  const curatedById = new Map(CURATED_PRICING_PROVIDER_ROWS.map((r) => [r.id, r.tier]));
  const inferTier = (id: string): MatrixRow["tier"] => {
    // Use the curated tier when known; otherwise infer from the highest
    // tier that grants this provider so the row still groups sensibly.
    const known = curatedById.get(id);
    if (known) return known;
    const allows = (t: "STARTER" | "GROWTH" | "STUDIO") =>
      plans.find((p) => p.tier === t)?.providerIds.includes(id) ?? false;
    if (allows("STARTER")) return "Standard";
    if (allows("GROWTH")) return "Premium";
    return "Top-tier";
  };
  const allRows: MatrixRow[] = showAll
    ? fullRows.map((r) => ({ id: r.id, displayName: r.displayName, tier: inferTier(r.id) }))
    : CURATED_PRICING_PROVIDER_ROWS.map((r) => ({ id: r.id, displayName: r.displayName, tier: r.tier }));
  const tierOrder: MatrixRow["tier"][] = ["Standard", "Premium", "Top-tier"];
  const groupedRows = tierOrder
    .map((tier) => ({ tier, items: allRows.filter((r) => r.tier === tier) }))
    .filter((g) => g.items.length > 0);

  return (
    <section className="max-w-6xl mx-auto px-6 py-16" aria-labelledby="matrix-heading">
      <div className="text-center mb-8">
        <h2 id="matrix-heading" className="text-3xl font-bold mb-3 bg-gradient-to-r from-white to-purple-200 bg-clip-text text-transparent">
          Provider access by plan
        </h2>
        <p className="text-sm" style={{ color: "var(--text-secondary, #94a3b8)" }}>
          60+ AI models, gated by plan tier. Standard models are unlocked for everyone.
        </p>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-sm" data-testid="provider-matrix-table">
          <thead>
            <tr className="border-b border-white/10 bg-white/5">
              <th className="text-left px-4 py-3 font-semibold">Model</th>
              {tierPlans.map((p) => (
                <th key={p.tier} className="text-center px-4 py-3 font-semibold">{p.displayName}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groupedRows.map((group) => (
              <Fragment key={group.tier}>
                <tr className="bg-purple-950/30" data-testid={`matrix-group-${group.tier}`}>
                  <th
                    colSpan={1 + tierPlans.length}
                    className="text-left px-4 py-2 text-[11px] uppercase tracking-wider font-semibold text-purple-200"
                    scope="colgroup"
                  >
                    {group.tier}
                  </th>
                </tr>
                {group.items.map((row) => (
                  <tr key={row.id} className="border-b border-white/5" data-testid={`matrix-row-${row.id}`}>
                    <td className="px-4 py-2.5">
                      <div className="font-medium">{row.displayName}</div>
                    </td>
                    {tierPlans.map((p) => (
                      <td key={p.tier} className="text-center px-4 py-2.5">
                        {planAllows(p.tier, row.id) ? (
                          <Check className="inline-block w-4 h-4 text-emerald-400" />
                        ) : (
                          <X className="inline-block w-4 h-4 text-slate-600" />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile per-plan stack */}
      <div className="md:hidden space-y-4">
        {tierPlans.map((p) => (
          <div key={p.tier} className="p-4 rounded-xl border border-white/10" data-testid={`matrix-mobile-${p.tier}`}>
            <h3 className="font-semibold mb-2">{p.displayName}</h3>
            <div className="space-y-3">
              {groupedRows.map((group) => (
                <div key={group.tier}>
                  <div className="text-[11px] uppercase tracking-wider text-purple-200 mb-1">{group.tier}</div>
                  <ul className="text-sm space-y-1" style={{ color: "var(--text-secondary, #cbd5e1)" }}>
                    {group.items.map((row) => (
                      <li key={row.id} className="flex items-center gap-2">
                        {planAllows(p.tier, row.id) ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        ) : (
                          <X className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                        )}
                        <span>{row.displayName}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 text-center">
        <button
          onClick={() => setShowAll(!showAll)}
          className="text-sm text-purple-300 hover:text-purple-200 underline-offset-2 hover:underline"
          data-testid="matrix-toggle-all"
        >
          {showAll ? "Show curated 12 models" : `Show all ${fullRows.length}+ models`}
        </button>
      </div>
    </section>
  );
}

function setMeta(name: string, content: string, attr: "name" | "property" = "name") {
  let el = document.querySelector(`meta[${attr}="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setLink(rel: string, href: string) {
  let el = document.querySelector(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

function PricingNav() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md" style={{ backgroundColor: "rgba(9, 9, 15, 0.7)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
      <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <img src={neuralcutFullLogo} alt="NeuralCut.AI" className="h-24 object-contain" />
        </Link>
        <div className="hidden md:flex items-center gap-6 text-sm" style={{ color: "var(--text-secondary, #94a3b8)" }}>
          <Link href="/#features" className="hover:text-white transition-colors">Features</Link>
          <Link href="/#capabilities" className="hover:text-white transition-colors">AI Models</Link>
          <Link href="/pricing" className="text-white">Pricing</Link>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/auth">
            <Button variant="ghost" size="sm" className="text-sm">Log in</Button>
          </Link>
          <Link href="/auth">
            <Button size="sm" className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-sm rounded-lg">
              Get Started Free
            </Button>
          </Link>
        </div>
      </div>
    </nav>
  );
}

function PricingFooter() {
  return (
    <footer className="border-t py-10 mt-8" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
      <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4 text-xs" style={{ color: "var(--text-muted, #64748b)" }}>
        <p>&copy; 2026 NeuralCut.AI. All rights reserved.</p>
        <div className="flex items-center gap-6">
          <Link href="/" className="hover:text-white transition-colors">Home</Link>
          <Link href="/pricing" className="hover:text-white transition-colors">Pricing</Link>
          <Link href="/contact-sales" className="hover:text-white transition-colors">Contact sales</Link>
        </div>
      </div>
    </footer>
  );
}
