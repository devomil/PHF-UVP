// Phase NC-02 — GenerateButton state machine + click routing.

/// <reference types="vitest" />
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GenerateButton } from "@/components/credits/generate-button";

const openTopUp = vi.fn();
const openUpgrade = vi.fn();
vi.mock("@/components/credits/credit-modals-provider", () => ({
  useCreditModals: () => ({
    openTopUp,
    closeTopUp: vi.fn(),
    openUpgrade,
    closeUpgrade: vi.fn(),
    topUpContext: null,
    upgradeContext: null,
  }),
}));

let mockBalance = { totalGC: 200, subscriptionGC: 200, topupGC: 0, monthlyGC: 200 };
let mockCost: { gcCost: number } | null = { gcCost: 20 };
vi.mock("@/hooks/use-credits", () => ({
  useCredits: () => ({ data: mockBalance }),
  useCreditCost: () => ({ data: mockCost }),
}));

function renderBtn(props: Partial<React.ComponentProps<typeof GenerateButton>> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <GenerateButton provider="kling-2.6" durationS={5} onClick={vi.fn()} {...props} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  openTopUp.mockReset();
  openUpgrade.mockReset();
  mockBalance = { totalGC: 200, subscriptionGC: 200, topupGC: 0, monthlyGC: 200 };
  mockCost = { gcCost: 20 };
});
afterEach(() => cleanup());

describe("GenerateButton state machine", () => {
  it("READY when balance comfortably covers cost", () => {
    const { getByTestId } = renderBtn();
    expect(getByTestId("generate-button").getAttribute("data-state")).toBe("ready");
    expect(getByTestId("generate-button-cost").textContent).toContain("20");
  });

  it("LOW when post-spend balance < 5% of plan", () => {
    mockBalance = { totalGC: 25, subscriptionGC: 25, topupGC: 0, monthlyGC: 200 };
    mockCost = { gcCost: 20 };
    const { getByTestId } = renderBtn();
    expect(getByTestId("generate-button").getAttribute("data-state")).toBe("low");
  });

  it("INSUFFICIENT routes click to openTopUp with shortfall + does not invoke onClick", () => {
    mockBalance = { totalGC: 5, subscriptionGC: 5, topupGC: 0, monthlyGC: 200 };
    mockCost = { gcCost: 20 };
    const onClick = vi.fn();
    const { getByTestId } = renderBtn({ onClick });
    expect(getByTestId("generate-button").getAttribute("data-state")).toBe("insufficient");
    fireEvent.click(getByTestId("generate-button"));
    expect(openTopUp).toHaveBeenCalledWith({ shortfall: 15, required: 20, provider: "kling-2.6" });
    expect(onClick).not.toHaveBeenCalled();
  });

  it("PLAN_LOCKED routes click to openUpgrade and hides cost badge", () => {
    const onClick = vi.fn();
    const { getByTestId, queryByTestId } = renderBtn({
      planLockedFor: { requiredPlan: "STUDIO" },
      onClick,
    });
    expect(getByTestId("generate-button").getAttribute("data-state")).toBe("plan-locked");
    expect(queryByTestId("generate-button-cost")).toBeNull();
    fireEvent.click(getByTestId("generate-button"));
    expect(openUpgrade).toHaveBeenCalledWith({ provider: "kling-2.6", requiredPlan: "STUDIO" });
    expect(onClick).not.toHaveBeenCalled();
  });

  it("READY click invokes the underlying onClick", () => {
    const onClick = vi.fn();
    const { getByTestId } = renderBtn({ onClick });
    fireEvent.click(getByTestId("generate-button"));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(openTopUp).not.toHaveBeenCalled();
  });
});
