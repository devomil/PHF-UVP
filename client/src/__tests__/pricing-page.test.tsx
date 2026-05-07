// Phase NC-03 — Public pricing page rendering tests.
/// <reference types="vitest" />
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, fireEvent, cleanup, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Mock pricing data + auth before importing the page
const mockPricing: any = {
  plans: [],
  topupPacks: [],
  generationRates: {
    liveSourced: true,
    tiers: {
      Standard: { min: 3, max: 6 },
      Premium: { min: 6, max: 14 },
      "Top-tier": { min: 14, max: 32 },
    },
    example: {
      clipDurationS: 5, clipsPerVideo: 6, videoDurationS: 30,
      premiumGCPerClip: 10, gcPerVideo: 60,
      planTier: "GROWTH", planMonthlyGC: 500, videosPerBudget: 8,
    },
  },
  catalogConfigured: new Map<string, boolean>(),
  providerConfigured: true,
  isLoading: false,
  error: null,
};
let isAuthed = false;
let lastNav: string | null = null;

vi.mock("@/hooks/use-public-pricing", () => ({
  usePublicPricing: () => mockPricing,
}));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ isAuthenticated: isAuthed, user: null }),
}));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));
vi.mock("wouter", () => ({
  Link: ({ children, href, ...rest }: any) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/pricing", (path: string) => { lastNav = path; }],
}));
vi.mock("@/assets/neuralcut-full-logo.png", () => ({ default: "logo.png" }));

const launchPlanCheckoutMock = vi.fn();
const launchTopUpCheckoutMock = vi.fn();
vi.mock("@/lib/checkout-launcher", () => ({
  launchPlanCheckout: (...args: any[]) => launchPlanCheckoutMock(...args),
  launchTopUpCheckout: (...args: any[]) => launchTopUpCheckoutMock(...args),
}));

import PricingPage from "@/pages/pricing";

function makePlan(over: any = {}) {
  return {
    tier: "STARTER",
    displayName: "Starter",
    monthlyGC: 200,
    monthlyPriceCents: 5900,
    annualPriceCents: 58800,
    annualMonthlyCents: 4900,
    annualSavingsCents: 12000,
    rolloverPercent: 0,
    rolloverMax: 0,
    overageRateCents: 12,
    maxResolution: "720p",
    maxClipDuration: 5,
    catalogKeyMonthly: "STARTER_MONTHLY",
    catalogKeyAnnual: "STARTER_ANNUAL",
    monthlyConfigured: true,
    annualConfigured: true,
    providerIds: ["kling-2.6", "hailuo"],
    marketingClaims: { seats: 1, brandWorkspaces: 1, prioritySupport: false, apiAccess: false, tagline: "For solo creators." },
    ...over,
  };
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <PricingPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  isAuthed = false;
  lastNav = null;
  launchPlanCheckoutMock.mockReset();
  launchTopUpCheckoutMock.mockReset();
  mockPricing.plans = [
    makePlan({ tier: "STARTER", displayName: "Starter", monthlyPriceCents: 5900, annualMonthlyCents: 4900, annualSavingsCents: 12000, catalogKeyMonthly: "STARTER_MONTHLY", catalogKeyAnnual: "STARTER_ANNUAL" }),
    makePlan({ tier: "GROWTH", displayName: "Growth", monthlyGC: 500, monthlyPriceCents: 14900, annualMonthlyCents: 12400, annualSavingsCents: 30000, catalogKeyMonthly: "GROWTH_MONTHLY", catalogKeyAnnual: "GROWTH_ANNUAL" }),
    makePlan({ tier: "STUDIO", displayName: "Studio", monthlyGC: 1200, monthlyPriceCents: 29900, annualMonthlyCents: 24900, annualSavingsCents: 60000, catalogKeyMonthly: "STUDIO_MONTHLY", catalogKeyAnnual: "STUDIO_ANNUAL" }),
    makePlan({ tier: "ENTERPRISE", displayName: "Enterprise", monthlyGC: 3000, monthlyPriceCents: 50000, annualMonthlyCents: 50000, annualSavingsCents: 0, catalogKeyMonthly: "ENTERPRISE_MONTHLY", catalogKeyAnnual: "ENTERPRISE_ANNUAL" }),
  ];
  mockPricing.topupPacks = [
    { id: "PACK_500", gc: 500, priceCents: 4500, catalogKey: "PACK_500", configured: true, badge: "POPULAR" },
    { id: "PACK_2500", gc: 2500, priceCents: 17500, catalogKey: "PACK_2500", configured: true, badge: "BEST VALUE" },
  ];
});
afterEach(() => cleanup());

describe("PricingPage", () => {
  it("renders plan prices from server config", () => {
    const { getByTestId } = renderPage();
    expect(getByTestId("pricing-plan-STARTER-price").textContent).toContain("$59");
    expect(getByTestId("pricing-plan-GROWTH-price").textContent).toContain("$149");
    expect(getByTestId("pricing-plan-STUDIO-price").textContent).toContain("$299");
  });

  it("Monthly→Annual swaps the price and shows savings", () => {
    const { getByTestId, queryByTestId } = renderPage();
    expect(queryByTestId("pricing-plan-GROWTH-annual-info")).toBeNull();
    fireEvent.click(getByTestId("period-annual"));
    expect(getByTestId("pricing-plan-GROWTH-price").textContent).toContain("$124");
    expect(getByTestId("pricing-plan-GROWTH-annual-info").textContent).toMatch(/Save \$300\/year/);
  });

  it("configured:false plan degrades CTA to 'Contact us' and routes to /contact-sales", () => {
    mockPricing.plans[0].monthlyConfigured = false;
    const { getByTestId } = renderPage();
    const cta = getByTestId("pricing-plan-STARTER-cta");
    expect(cta.textContent).toMatch(/Contact us/);
    fireEvent.click(cta);
    expect(lastNav).toBe("/contact-sales?plan=STARTER");
    expect(launchPlanCheckoutMock).not.toHaveBeenCalled();
  });

  it("signed-out CTA invokes launchPlanCheckout (returns redirect URL)", async () => {
    launchPlanCheckoutMock.mockResolvedValue({ ok: true, url: "/auth?next=%2Fbilling&plan=GROWTH_MONTHLY" });
    isAuthed = false;
    const { getByTestId } = renderPage();
    fireEvent.click(getByTestId("pricing-plan-GROWTH-cta"));
    await Promise.resolve();
    expect(launchPlanCheckoutMock).toHaveBeenCalledWith(expect.objectContaining({
      isAuthenticated: false,
      tier: "GROWTH",
      period: "monthly",
      catalogKey: "GROWTH_MONTHLY",
    }));
  });

  it("renders the FAQ accordion with all questions", () => {
    const { getByTestId } = renderPage();
    const faq = getByTestId("faq-accordion");
    expect(within(faq).getAllByTestId(/^faq-q-/).length).toBeGreaterThanOrEqual(8);
  });

  it("provider matrix shows curated rows by default and expands to all", () => {
    const { getByTestId, queryByTestId } = renderPage();
    expect(queryByTestId("matrix-row-kling-2.6")).not.toBeNull();
    const toggle = getByTestId("matrix-toggle-all");
    expect(toggle.textContent).toMatch(/Show all/);
    fireEvent.click(toggle);
    expect(getByTestId("matrix-toggle-all").textContent).toMatch(/Show curated/);
  });

  it("renders overage rate as integer cents (no 100x understatement)", () => {
    const { container } = renderPage();
    expect(container.textContent).toMatch(/Overage:\s*12¢\s*\/\s*GC/);
    expect(container.textContent).not.toMatch(/0\.12¢\s*\/\s*GC/);
  });

  it("GC explainer renders ranges and example from live rates", () => {
    const { getByTestId } = renderPage();
    expect(getByTestId("gc-tier-Premium-range").textContent).toMatch(/6–14 GC/);
    expect(getByTestId("gc-tier-Top-tier-range").textContent).toMatch(/14–32 GC/);
    const ex = getByTestId("gc-example").textContent || "";
    expect(ex).toMatch(/~10 GC each/);
    expect(ex).toMatch(/about 60 GC/);
    expect(ex).toMatch(/500 GC budget/);
    expect(ex).toMatch(/roughly 8 videos/);
  });

  it("sets og:image and twitter:image meta tags", () => {
    renderPage();
    const og = document.head.querySelector('meta[property="og:image"]') as HTMLMetaElement | null;
    const tw = document.head.querySelector('meta[name="twitter:image"]') as HTMLMetaElement | null;
    expect(og?.content).toMatch(/og-pricing\.png$/);
    expect(tw?.content).toMatch(/og-pricing\.png$/);
  });

  it("top-up CTA calls launchTopUpCheckout with the right pack id", async () => {
    launchTopUpCheckoutMock.mockResolvedValue({ ok: true, url: "https://stripe/x" });
    const { getByTestId } = renderPage();
    fireEvent.click(getByTestId("topup-pack-PACK_500-cta"));
    await Promise.resolve();
    expect(launchTopUpCheckoutMock).toHaveBeenCalledWith(expect.objectContaining({ packId: "PACK_500", catalogKey: "PACK_500" }));
  });
});
