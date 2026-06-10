// Task #193 — DeckToVideoForm credit UX:
//   1. The deck-analysis cost preview is shown before upload, reading
//      its value from /api/credits/cost.
//   2. A 402 INSUFFICIENT_CREDITS envelope from
//      POST /api/deck-to-video/analyze routes into the shared top-up
//      modal instead of degrading to a generic failure toast.
// Mirrors the modal-routing patterns in use-generation-error-handler.test.tsx.

/// <reference types="vitest" />
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const openTopUp = vi.fn();
const openUpgrade = vi.fn();
const toast = vi.fn();

// CreditCost and useGenerationErrorHandler both consume useCreditModals;
// stub it so we can assert routing without the real modal stack.
vi.mock("@/components/credits/credit-modals-provider", () => ({
  useCreditModals: () => ({
    openTopUp,
    closeTopUp: vi.fn(),
    openUpgrade,
    closeUpgrade: vi.fn(),
    topUpContext: null,
    upgradeContext: null,
  }),
  CreditModalsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

import { DeckToVideoForm } from "@/pages/new-project";

const balanceSnap = {
  subscriptionGC: 1000,
  topupGC: 0,
  totalGC: 1000,
  monthlyGC: 1000,
  plan: "GROWTH",
  status: "ACTIVE",
  cycleStart: "2026-05-01",
  cycleEnd: "2026-06-01",
  warningLevel: "calm",
  percentUsed: 0,
  daysUntilReset: 25,
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Per-test override for the POST /api/deck-to-video/analyze response.
let analyzeResponse: () => Response = () => jsonResponse({ analysis: {} });

beforeEach(() => {
  openTopUp.mockReset();
  openUpgrade.mockReset();
  toast.mockReset();
  analyzeResponse = () => jsonResponse({ analysis: {} });
  global.fetch = vi.fn(async (input: any) => {
    const url = typeof input === "string" ? input : input.url;
    if (url.startsWith("/api/credits/cost")) {
      return jsonResponse({ provider: "deck-analysis", quality: null, durationS: null, gcCost: 12 });
    }
    if (url.startsWith("/api/credits/balance")) {
      return jsonResponse(balanceSnap);
    }
    if (url.startsWith("/api/deck-to-video/analyze")) {
      return analyzeResponse();
    }
    throw new Error(`unexpected fetch: ${url}`);
  }) as any;
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderForm() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        // useCredits relies on the app-level default queryFn (queryKey[0]).
        queryFn: async ({ queryKey }) => {
          const res = await fetch(queryKey[0] as string, { credentials: "include" });
          return res.json();
        },
      },
    },
  });
  return render(
    <QueryClientProvider client={qc}>
      <DeckToVideoForm onBack={vi.fn()} onSubmit={vi.fn()} isLoading={false} />
    </QueryClientProvider>,
  );
}

describe("DeckToVideoForm cost preview", () => {
  it("shows the deck-analysis cost preview before upload, reading from /api/credits/cost", async () => {
    const { getByTestId, findByTestId } = renderForm();

    // The dropzone (pre-upload state) is present...
    expect(getByTestId("dropzone-deck")).not.toBeNull();

    // ...and the cost preview resolves to the value from /api/credits/cost.
    const detail = await findByTestId("credit-cost-detail");
    expect(detail.textContent).toContain("12 GC");

    const calledCost = (global.fetch as any).mock.calls.some(
      (c: any[]) => String(c[0]).startsWith("/api/credits/cost"),
    );
    expect(calledCost).toBe(true);
  });
});

describe("DeckToVideoForm insufficient-credits routing", () => {
  it("opens the top-up modal on a 402 INSUFFICIENT_CREDITS instead of a generic toast", async () => {
    analyzeResponse = () =>
      jsonResponse(
        {
          success: false,
          error: "no funds",
          code: "INSUFFICIENT_CREDITS",
          required: 12,
          available: 4,
          shortfall: 8,
          provider: "deck-analysis",
          quality: null,
          durationS: null,
        },
        402,
      );

    const { getByTestId } = renderForm();
    const input = getByTestId("input-deck-file") as HTMLInputElement;
    const file = new File(["%PDF-1.4 fake deck"], "deck.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(openTopUp).toHaveBeenCalledTimes(1));
    expect(openTopUp).toHaveBeenCalledWith({ shortfall: 8, required: 12, provider: "deck-analysis" });
    expect(openUpgrade).not.toHaveBeenCalled();

    // It must NOT fall back to the generic "Analysis failed" toast.
    const genericFailure = toast.mock.calls.some(
      (c: any[]) => c[0] && c[0].title === "Analysis failed",
    );
    expect(genericFailure).toBe(false);
  });
});
