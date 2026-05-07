// Phase NC-02 — CreditWarning dismiss behavior.
// Per spec: only WARNING (80–95% used) is dismissible; URGENT and EMPTY
// are NEVER dismissible. Dismissals persist via sessionStorage scoped
// to the current cycleStart so a new cycle re-arms the banner.

/// <reference types="vitest" />
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { CreditWarning } from "@/components/credits/credit-warning";

let snapshot: any = null;
vi.mock("@/hooks/use-credits", () => ({
  useCredits: () => ({ data: snapshot }),
}));
vi.mock("@/components/credits/credit-modals-provider", () => ({
  useCreditModals: () => ({
    openTopUp: vi.fn(),
    closeTopUp: vi.fn(),
    openUpgrade: vi.fn(),
    closeUpgrade: vi.fn(),
    topUpContext: null,
    upgradeContext: null,
  }),
}));
vi.mock("wouter", () => ({
  Link: ({ children, href, ...rest }: any) => <a href={href} {...rest}>{children}</a>,
}));

beforeEach(() => {
  sessionStorage.clear();
  snapshot = null;
});
afterEach(() => cleanup());

function snap(level: string, extra: Partial<any> = {}) {
  return {
    subscriptionGC: 0, topupGC: 0, totalGC: 0, monthlyGC: 100,
    plan: "STARTER", status: "ACTIVE",
    cycleStart: "2026-05-01", cycleEnd: "2026-06-01",
    warningLevel: level, percentUsed: 90, daysUntilReset: 25,
    ...extra,
  };
}

describe("CreditWarning", () => {
  it("does not render when calm", () => {
    snapshot = snap("calm");
    const { queryByTestId } = render(<CreditWarning />);
    expect(queryByTestId("credit-warning")).toBeNull();
  });

  it("WARNING tier shows the dismiss button", () => {
    snapshot = snap("warning");
    const { getByTestId, queryByTestId } = render(<CreditWarning />);
    expect(getByTestId("credit-warning").getAttribute("data-warning-level")).toBe("warning");
    expect(queryByTestId("credit-warning-dismiss")).not.toBeNull();
  });

  it("URGENT tier hides the dismiss button", () => {
    snapshot = snap("urgent");
    const { getByTestId, queryByTestId } = render(<CreditWarning />);
    expect(getByTestId("credit-warning").getAttribute("data-warning-level")).toBe("urgent");
    expect(queryByTestId("credit-warning-dismiss")).toBeNull();
  });

  it("EMPTY tier hides the dismiss button", () => {
    snapshot = snap("empty");
    const { queryByTestId } = render(<CreditWarning />);
    expect(queryByTestId("credit-warning-dismiss")).toBeNull();
  });

  it("clicking dismiss persists per cycleStart in sessionStorage", () => {
    snapshot = snap("warning");
    const { getByTestId, queryByTestId } = render(<CreditWarning />);
    fireEvent.click(getByTestId("credit-warning-dismiss"));
    expect(queryByTestId("credit-warning")).toBeNull();
    expect(sessionStorage.getItem("creditWarning.dismissed.2026-05-01")).toBe("1");
  });

  it("a different cycleStart re-arms the warning even if a prior cycle was dismissed", () => {
    sessionStorage.setItem("creditWarning.dismissed.2026-05-01", "1");
    snapshot = snap("warning", { cycleStart: "2026-06-01" });
    const { getByTestId } = render(<CreditWarning />);
    expect(getByTestId("credit-warning")).not.toBeNull();
  });
});
