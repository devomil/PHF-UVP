// Phase NC-02 — useGenerationErrorHandler routes 402/403 envelopes to
// the right shared modal action without each call site duplicating
// the detection logic.

/// <reference types="vitest" />
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { renderHook, act } from "@testing-library/react";
import { useGenerationErrorHandler } from "@/hooks/use-generation-error-handler";

const openTopUp = vi.fn();
const openUpgrade = vi.fn();
const toast = vi.fn();

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
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

beforeEach(() => {
  openTopUp.mockReset();
  openUpgrade.mockReset();
  toast.mockReset();
});

describe("useGenerationErrorHandler", () => {
  it("routes INSUFFICIENT_CREDITS payload to openTopUp", async () => {
    const { result } = renderHook(() => useGenerationErrorHandler());
    let handled = false;
    await act(async () => {
      handled = await result.current.handle({
        success: false,
        error: "no funds",
        code: "INSUFFICIENT_CREDITS",
        required: 50,
        available: 12,
        shortfall: 38,
        provider: "kling-2.6",
        quality: "std",
        durationS: 5,
      });
    });
    expect(handled).toBe(true);
    expect(openTopUp).toHaveBeenCalledWith({ shortfall: 38, required: 50, provider: "kling-2.6" });
    expect(openUpgrade).not.toHaveBeenCalled();
  });

  it("routes PROVIDER_NOT_IN_PLAN payload to openUpgrade", async () => {
    const { result } = renderHook(() => useGenerationErrorHandler());
    let handled = false;
    await act(async () => {
      handled = await result.current.handle({
        success: false,
        error: "locked",
        code: "PROVIDER_NOT_IN_PLAN",
        provider: "sora-2-pro",
        currentPlan: "STARTER",
        requiredPlan: "STUDIO",
      });
    });
    expect(handled).toBe(true);
    expect(openUpgrade).toHaveBeenCalledWith({ provider: "sora-2-pro", requiredPlan: "STUDIO" });
    expect(openTopUp).not.toHaveBeenCalled();
  });

  it("returns false for unknown payloads with no status", async () => {
    const { result } = renderHook(() => useGenerationErrorHandler());
    let handled = true;
    await act(async () => {
      handled = await result.current.handle({ success: true });
    });
    expect(handled).toBe(false);
    expect(openTopUp).not.toHaveBeenCalled();
    expect(openUpgrade).not.toHaveBeenCalled();
  });

  it("falls back to a generic toast for unknown 4xx Response", async () => {
    const res = new Response(JSON.stringify({ error: "boom" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
    const { result } = renderHook(() => useGenerationErrorHandler());
    let handled = false;
    await act(async () => {
      handled = await result.current.handle(res);
    });
    expect(handled).toBe(true);
    expect(toast).toHaveBeenCalled();
    expect(openTopUp).not.toHaveBeenCalled();
    expect(openUpgrade).not.toHaveBeenCalled();
  });
});
