// Phase NC-02 follow-up — Admin-unlimited UI posture.

/// <reference types="vitest" />
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, fireEvent, cleanup, act } from "@testing-library/react";
import { CreditMeter } from "@/components/credits/credit-meter";
import { CreditWarning } from "@/components/credits/credit-warning";
import { GenerateButton } from "@/components/credits/generate-button";
import {
  CreditModalsProvider,
  useCreditModals,
} from "@/components/credits/credit-modals-provider";
import { isAdminUnlimitedSnapshot } from "@/lib/admin-unlimited";
import type { CreditSnapshot } from "@/hooks/use-credits";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

let snapshot: CreditSnapshot | null = null;
let cost: { gcCost: number } | null = { gcCost: 20 };

vi.mock("@/hooks/use-credits", () => ({
  useCredits: () => ({ data: snapshot, isLoading: false }),
  useCreditCost: () => ({ data: cost }),
}));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));
vi.mock("wouter", () => ({
  Link: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) =>
    React.createElement("a", { href, ...rest }, children),
}));
vi.mock("@/hooks/use-credit-notifications", () => ({
  useCreditNotifications: () => ({ items: [], unreadCount: 0, markRead: vi.fn(), markAllRead: vi.fn() }),
}));

const adminSnap: CreditSnapshot = {
  subscriptionGC: 5, topupGC: 0, totalGC: 5, monthlyGC: 50,
  plan: "FREE_TRIAL", status: "ACTIVE",
  cycleStart: "2026-05-01", cycleEnd: "2026-06-01",
  warningLevel: "calm", percentUsed: 0, daysUntilReset: 25,
  unlimited: true, monthlyUsedGC: 240,
};

const lowPayingSnap: CreditSnapshot = {
  ...adminSnap,
  warningLevel: "urgent", percentUsed: 98,
  unlimited: false, monthlyUsedGC: undefined,
};

beforeEach(() => { snapshot = null; cost = { gcCost: 20 }; });
afterEach(() => cleanup());

describe("isAdminUnlimitedSnapshot", () => {
  it("reflects server-derived flag", () => {
    expect(isAdminUnlimitedSnapshot(undefined)).toBe(false);
    expect(isAdminUnlimitedSnapshot(null)).toBe(false);
    expect(isAdminUnlimitedSnapshot(lowPayingSnap)).toBe(false);
    expect(isAdminUnlimitedSnapshot(adminSnap)).toBe(true);
  });
});

function withProviders(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <CreditModalsProvider>{node}</CreditModalsProvider>
    </QueryClientProvider>
  );
}

describe("CreditMeter (admin-unlimited)", () => {
  it("renders the Unlimited · Admin chip when unlimited:true", () => {
    snapshot = adminSnap;
    const { getByTestId, getByText } = render(withProviders(<CreditMeter />));
    expect(getByTestId("credit-meter-unlimited")).not.toBeNull();
    expect(getByText("Unlimited")).not.toBeNull();
    expect(getByText("Admin")).not.toBeNull();
  });

  it("falls back to the standard meter for non-admins", () => {
    snapshot = lowPayingSnap;
    const { queryByTestId } = render(withProviders(<CreditMeter />));
    expect(queryByTestId("credit-meter-unlimited")).toBeNull();
  });
});

describe("CreditWarning (admin-unlimited)", () => {
  it("is suppressed for admin even at urgent severity", () => {
    snapshot = { ...adminSnap, warningLevel: "urgent", percentUsed: 98 };
    const { queryByTestId } = render(withProviders(<CreditWarning />));
    expect(queryByTestId("credit-warning")).toBeNull();
  });
});

function renderBtn() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CreditModalsProvider>
        <GenerateButton provider="sora-2-pro" durationS={5} planLockedFor={{ requiredPlan: "STUDIO" }} onClick={vi.fn()} />
      </CreditModalsProvider>
    </QueryClientProvider>,
  );
}

describe("GenerateButton (admin-unlimited)", () => {
  it("stays READY for admin even with planLockedFor + zero balance", () => {
    snapshot = { ...adminSnap, totalGC: 0, subscriptionGC: 0 };
    cost = { gcCost: 999 };
    const { getByTestId } = renderBtn();
    expect(getByTestId("generate-button").getAttribute("data-state")).toBe("ready");
  });
});

function ModalProbe() {
  const { openTopUp, openUpgrade } = useCreditModals();
  return (
    <div>
      <button data-testid="open-topup-btn" onClick={() => openTopUp({ shortfall: 10, required: 10 })} />
      <button data-testid="open-upgrade-btn" onClick={() => openUpgrade({ provider: "sora-2-pro", requiredPlan: "STUDIO" })} />
    </div>
  );
}

describe("CreditModalsProvider (admin-unlimited)", () => {
  it("openTopUp and openUpgrade are no-ops for admin (toast no modal)", () => {
    snapshot = adminSnap;
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { getByTestId, queryByTestId } = render(
      <QueryClientProvider client={qc}>
        <CreditModalsProvider>
          <ModalProbe />
        </CreditModalsProvider>
      </QueryClientProvider>,
    );
    act(() => { fireEvent.click(getByTestId("open-topup-btn")); });
    act(() => { fireEvent.click(getByTestId("open-upgrade-btn")); });
    expect(queryByTestId("topup-modal")).toBeNull();
    expect(queryByTestId("upgrade-modal")).toBeNull();
  });
});
