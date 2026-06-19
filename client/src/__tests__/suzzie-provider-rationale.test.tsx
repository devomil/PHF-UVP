/// <reference types="vitest" />
// @vitest-environment jsdom

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent, act } from "@testing-library/react";

// ---------------------------------------------------------------------------
// jsdom stubs for browser APIs not implemented in the test environment
// ---------------------------------------------------------------------------
window.HTMLElement.prototype.scrollIntoView = vi.fn();

// ---------------------------------------------------------------------------
// Shared provider mocks — ProviderCapabilitySelector relies on these at
// module-load time, so they must be hoisted before the component import.
// ---------------------------------------------------------------------------
vi.mock("@shared/provider-config", () => ({
  VIDEO_PROVIDERS: {
    "kling-2.6": {
      displayName: "Kling 2.6 Pro",
      description: "High-quality video generation",
      tier: "premium",
      family: "Kling",
      specialties: ["product"],
      bestFor: ["product videos"],
      costPerSecond: 0.05,
    },
  },
}));

vi.mock("@shared/provider-catalog", () => ({
  getDropdownVideoProviders: () => [
    { id: "auto" },
    { id: "kling-2.6" },
  ],
  VIDEO_PROVIDER_CATALOG: [],
}));

// ---------------------------------------------------------------------------
// Tooltip stub — avoids Radix Tooltip's portal behaviour in jsdom
// ---------------------------------------------------------------------------
vi.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  Tooltip: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  TooltipTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) =>
    React.createElement(React.Fragment, null, children),
  TooltipContent: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", { "data-testid": "tooltip-content" }, children),
}));

// Button stub for AssetSuzzieChat
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, disabled, type, className, size }: any) =>
    React.createElement("button", { onClick, disabled, type, className }, children),
}));

// Input stub
vi.mock("@/components/ui/input", () => ({
  Input: (props: any) => React.createElement("input", props),
}));

// apiRequest mock for AssetSuzzieChat (its API layer)
const apiRequestMock = vi.fn();
vi.mock("@/lib/queryClient", () => ({
  apiRequest: (...args: any[]) => apiRequestMock(...args),
}));

// ---------------------------------------------------------------------------
// Component imports — after vi.mock declarations (which are hoisted)
// ---------------------------------------------------------------------------
import { AskSuzziePanel } from "@/components/video/ask-suzzie-panel";
import { AssetSuzzieChat } from "@/components/video/AssetSuzzieChat";
import { ProviderCapabilitySelector } from "@/components/video/ProviderCapabilityCard";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFetchMock(suggestedProvider: string, suggestedProviderRationale: string) {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      success: true,
      message: "I recommend Kling 2.6 Pro for this scene.",
      suggestedProvider,
      suggestedProviderRationale,
    }),
    text: async () => "{}",
  })) as unknown as typeof fetch;
}

// ---------------------------------------------------------------------------
// 1. AskSuzziePanel — onApplyProvider passes providerId + rationale
// ---------------------------------------------------------------------------
describe("AskSuzziePanel — onApplyProvider rationale passthrough", () => {
  const PROVIDER_ID = "kling-2.6";
  const RATIONALE = "Kling 2.6 Pro excels at stable product I2V with strong compositional control.";

  let onApplyProvider: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onApplyProvider = vi.fn();
    (global as any).fetch = makeFetchMock(PROVIDER_ID, RATIONALE);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("passes both providerId and rationale when the Apply Provider button is clicked", async () => {
    render(
      React.createElement(AskSuzziePanel, {
        sceneContext: { narration: "Our product launch moment" },
        onApplyProvider,
      })
    );

    // Open the panel
    const fab = screen.getByText("Ask Suzzie");
    fireEvent.click(fab);

    // Click the "Best style & provider?" quick action to trigger an API call
    const quickAction = await screen.findByText("Best style & provider?");
    fireEvent.click(quickAction);

    // Wait for the "Apply Provider" button to appear after the mocked response
    const applyBtn = await screen.findByText("Apply Provider");
    fireEvent.click(applyBtn);

    expect(onApplyProvider).toHaveBeenCalledOnce();
    expect(onApplyProvider).toHaveBeenCalledWith(PROVIDER_ID, RATIONALE);
  });

  it("passes undefined rationale when the message has no rationale", async () => {
    (global as any).fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        message: "Try this provider.",
        suggestedProvider: PROVIDER_ID,
        // no suggestedProviderRationale
      }),
      text: async () => "{}",
    }));

    render(
      React.createElement(AskSuzziePanel, {
        sceneContext: { narration: "Scene narration" },
        onApplyProvider,
      })
    );

    fireEvent.click(screen.getByText("Ask Suzzie"));
    const quickAction = await screen.findByText("Best style & provider?");
    fireEvent.click(quickAction);

    const applyBtn = await screen.findByText("Apply Provider");
    fireEvent.click(applyBtn);

    expect(onApplyProvider).toHaveBeenCalledOnce();
    expect(onApplyProvider).toHaveBeenCalledWith(PROVIDER_ID, undefined);
  });
});

// ---------------------------------------------------------------------------
// 2. AssetSuzzieChat — onApplyProvider passes providerId + rationale
// ---------------------------------------------------------------------------
describe("AssetSuzzieChat — onApplyProvider rationale passthrough", () => {
  const PROVIDER_ID = "kling-2.6";
  const RATIONALE = "Kling 2.6 Pro keeps your product label sharp while the environment builds.";

  let onApplyProvider: ReturnType<typeof vi.fn>;

  const DEFAULT_PROPS = {
    mode: "t2v",
    provider: "auto",
    prompt: "",
    hasReferenceImage: false,
    aspectRatio: "16:9",
    duration: 5,
    style: "cinematic",
    validProviderIds: [PROVIDER_ID, "auto"],
    onApplyPrompt: vi.fn(),
  };

  beforeEach(() => {
    onApplyProvider = vi.fn();
    apiRequestMock.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("passes both providerId and rationale when the Apply button is clicked", async () => {
    // When opened with empty prompt, no auto-trigger fires — we send manually.
    // Mock the API to return a provider suggestion.
    apiRequestMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        message: "Kling 2.6 Pro is best for this.",
        suggestedProvider: PROVIDER_ID,
        suggestedProviderRationale: RATIONALE,
      }),
    });

    render(
      React.createElement(AssetSuzzieChat, {
        ...DEFAULT_PROPS,
        onApplyProvider,
      })
    );

    // Open the panel (empty prompt → no auto-trigger, just opens)
    const openBtn = screen.getByText("Ask Suzzie");
    fireEvent.click(openBtn);

    // Type and send a message to trigger the API call
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Which provider should I use?" } });
    fireEvent.keyDown(input, { key: "Enter" });

    // Wait for the "Apply" button to appear
    const applyBtn = await screen.findByText("Apply");
    fireEvent.click(applyBtn);

    expect(onApplyProvider).toHaveBeenCalledOnce();
    expect(onApplyProvider).toHaveBeenCalledWith(PROVIDER_ID, RATIONALE);
  });

  it("does not call onApplyProvider when the suggestedProvider is not in validProviderIds", async () => {
    apiRequestMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        message: "Try this provider.",
        suggestedProvider: "unknown-provider-xyz",
        suggestedProviderRationale: "Some rationale",
      }),
    });

    render(
      React.createElement(AssetSuzzieChat, {
        ...DEFAULT_PROPS,
        onApplyProvider,
      })
    );

    fireEvent.click(screen.getByText("Ask Suzzie"));

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Which provider?" } });
    fireEvent.keyDown(input, { key: "Enter" });

    // The "Apply" button should NOT appear because the provider is invalid
    await waitFor(() => {
      expect(
        screen.queryByText("Apply")
      ).toBeNull();
    });

    expect(onApplyProvider).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 3. ProviderCapabilitySelector — "Why?" badge visibility
// ---------------------------------------------------------------------------
describe("ProviderCapabilitySelector — suzzieRationale badge", () => {
  const RATIONALE = "Kling 2.6 Pro offers stable product I2V with strong compositional control.";
  const onSelectProvider = vi.fn();

  afterEach(() => {
    cleanup();
    onSelectProvider.mockReset();
  });

  it("renders the 'Why?' badge when suzzieRationale is set", () => {
    render(
      React.createElement(ProviderCapabilitySelector, {
        selectedProvider: "kling-2.6",
        onSelectProvider,
        suzzieRationale: RATIONALE,
      })
    );

    expect(screen.getByText("Why?")).toBeTruthy();
  });

  it("does not render the 'Why?' badge when suzzieRationale is absent", () => {
    render(
      React.createElement(ProviderCapabilitySelector, {
        selectedProvider: "kling-2.6",
        onSelectProvider,
      })
    );

    expect(screen.queryByText("Why?")).toBeNull();
  });

  it("badge disappears when the parent re-renders without a rationale (simulating a manual provider change)", () => {
    const { rerender } = render(
      React.createElement(ProviderCapabilitySelector, {
        selectedProvider: "kling-2.6",
        onSelectProvider,
        suzzieRationale: RATIONALE,
      })
    );

    // Badge visible initially
    expect(screen.getByText("Why?")).toBeTruthy();

    // Parent clears the rationale after the user manually picks a provider
    rerender(
      React.createElement(ProviderCapabilitySelector, {
        selectedProvider: "kling-2.6",
        onSelectProvider,
        suzzieRationale: undefined,
      })
    );

    expect(screen.queryByText("Why?")).toBeNull();
  });

  it("shows Suzzie's reasoning in the tooltip content when the badge is rendered", () => {
    render(
      React.createElement(ProviderCapabilitySelector, {
        selectedProvider: "kling-2.6",
        onSelectProvider,
        suzzieRationale: RATIONALE,
      })
    );

    const tooltipContent = screen.getByTestId("tooltip-content");
    expect(tooltipContent.textContent).toContain(RATIONALE);
  });
});
