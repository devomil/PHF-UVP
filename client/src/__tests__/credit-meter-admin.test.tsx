// Phase NC-02 follow-up — Admin-unlimited UI posture.
// Verifies the credit meter renders the "Unlimited · Admin" chip and
// the warning banner is suppressed when the server reports
// `unlimited: true` on the snapshot.

/// <reference types="vitest" />
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, cleanup } from "@testing-library/react";
import { CreditMeter } from "@/components/credits/credit-meter";
import { CreditWarning } from "@/components/credits/credit-warning";
import { isAdminUnlimitedSnapshot } from "@/lib/admin-unlimited";

let snapshot: any = null;
vi.mock("@/hooks/use-credits", () => ({
  useCredits: () => ({ data: snapshot, isLoading: false }),
}));
vi.mock("@/components/credits/credit-modals-provider", () => ({
  useCreditModals: () => ({
    openTopUp: vi.fn(),
    closeTopUp: vi.fn(),
    openUpgrade: vi.fn(),
    closeUpgrade: vi.fn(),
  }),
}));
vi.mock("wouter", () => ({
  Link: ({ children, href, ...rest }: any) => <a href={href} {...rest}>{children}</a>,
}));

beforeEach(() => {
  snapshot = null;
});
afterEach(() => cleanup());

const adminSnap = {
  subscriptionGC: 5, topupGC: 0, totalGC: 5, monthlyGC: 50,
  plan: "FREE_TRIAL", status: "ACTIVE",
  cycleStart: "2026-05-01", cycleEnd: "2026-06-01",
  warningLevel: "calm", percentUsed: 0, daysUntilReset: 25,
  unlimited: true, monthlyUsedGC: 240,
};

const lowPayingSnap = {
  ...adminSnap,
  warningLevel: "urgent", percentUsed: 98,
  unlimited: false, monthlyUsedGC: undefined,
};

describe("admin-unlimited client predicate", () => {
  it("isAdminUnlimitedSnapshot reflects server-derived flag", () => {
    expect(isAdminUnlimitedSnapshot(undefined)).toBe(false);
    expect(isAdminUnlimitedSnapshot(null)).toBe(false);
    expect(isAdminUnlimitedSnapshot(lowPayingSnap as any)).toBe(false);
    expect(isAdminUnlimitedSnapshot(adminSnap as any)).toBe(true);
  });
});

describe("CreditMeter (admin-unlimited)", () => {
  it("renders the Unlimited · Admin chip when unlimited:true", () => {
    snapshot = adminSnap;
    const { getByTestId, getByText } = render(<CreditMeter />);
    expect(getByTestId("credit-meter-unlimited")).not.toBeNull();
    expect(getByText("Unlimited")).not.toBeNull();
    expect(getByText("Admin")).not.toBeNull();
  });

  it("falls back to the standard four-tone meter for non-admins", () => {
    snapshot = lowPayingSnap;
    const { queryByTestId } = render(<CreditMeter />);
    expect(queryByTestId("credit-meter-unlimited")).toBeNull();
  });
});

describe("CreditWarning (admin-unlimited)", () => {
  it("is suppressed for admin even at urgent severity", () => {
    snapshot = { ...adminSnap, warningLevel: "urgent", percentUsed: 98 };
    const { queryByTestId } = render(<CreditWarning />);
    expect(queryByTestId("credit-warning")).toBeNull();
  });
});
