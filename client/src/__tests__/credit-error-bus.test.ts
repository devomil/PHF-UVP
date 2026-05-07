// Phase NC-02 — credit-error bus dispatches canonical envelopes to the
// registered handler exactly once per registration.

/// <reference types="vitest" />
import { describe, it, expect, vi, afterEach } from "vitest";
import { dispatchCreditError, registerCreditErrorHandler, tryDispatchFromResponse } from "@/lib/credit-error-bus";

afterEach(() => {
  // Each test re-registers so the previous handler is replaced; the
  // unsubscribe returned here also tears down on test exit.
  registerCreditErrorHandler(() => {})();
});

describe("credit-error-bus", () => {
  it("dispatches INSUFFICIENT_CREDITS envelopes", () => {
    const h = vi.fn();
    registerCreditErrorHandler(h);
    const env = { code: "INSUFFICIENT_CREDITS", shortfall: 10, required: 50, available: 40, provider: "kling-2.6", quality: null, durationS: 5 };
    expect(dispatchCreditError(env)).toBe(true);
    expect(h).toHaveBeenCalledWith(env);
  });

  it("dispatches PROVIDER_NOT_IN_PLAN envelopes", () => {
    const h = vi.fn();
    registerCreditErrorHandler(h);
    const env = { code: "PROVIDER_NOT_IN_PLAN", provider: "veo-3", currentPlan: "STARTER", requiredPlan: "STUDIO" };
    expect(dispatchCreditError(env)).toBe(true);
    expect(h).toHaveBeenCalledWith(env);
  });

  it("ignores unrelated envelopes", () => {
    const h = vi.fn();
    registerCreditErrorHandler(h);
    expect(dispatchCreditError({ code: "BUDGET_EXCEEDED", estimatedCost: 1, budgetCap: 0.5 })).toBe(false);
    expect(dispatchCreditError(null)).toBe(false);
    expect(dispatchCreditError("oops")).toBe(false);
    expect(h).not.toHaveBeenCalled();
  });

  it("only routes 402/403 responses through tryDispatchFromResponse", async () => {
    const h = vi.fn();
    registerCreditErrorHandler(h);
    const ok500 = new Response(JSON.stringify({ code: "INSUFFICIENT_CREDITS" }), { status: 500 });
    expect(await tryDispatchFromResponse(ok500)).toBe(false);
    expect(h).not.toHaveBeenCalled();
    const r402 = new Response(
      JSON.stringify({ code: "INSUFFICIENT_CREDITS", shortfall: 5, required: 25, available: 20, provider: null, quality: null, durationS: null }),
      { status: 402, headers: { "content-type": "application/json" } },
    );
    expect(await tryDispatchFromResponse(r402)).toBe(true);
    expect(h).toHaveBeenCalledTimes(1);
  });
});
