// @vitest-environment jsdom
//
// ProviderCatalogSelector — auto-clear rationale badge tests
//
// Verified behaviour:
//   • "Why?" badge is visible when suzzieRationale is provided
//   • Badge disappears automatically when the user picks a different provider
//     (no parent cooperation required — internal visibleRationale state owns it)
//   • onClearRationale callback fires when the user picks a provider
//   • Badge disappears when parent clears suzzieRationale (prop sync via useEffect)
//   • Badge content updates when parent supplies a new suzzieRationale
//
// Tooltip primitives are stubbed because Radix's TooltipProvider uses
// pointer-event APIs that jsdom doesn't implement.
// Provider catalog is mocked to two deterministic entries so tests don't
// depend on real catalog contents.

import React from "react";
import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/components/ui/tooltip", () => {
  const Pass = ({ children }: { children?: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children);
  return {
    Tooltip: Pass,
    TooltipTrigger: ({ children }: any) =>
      React.createElement(React.Fragment, null, children),
    TooltipContent: ({ children }: any) =>
      React.createElement("div", { "data-testid": "mock-tt" }, children),
    TooltipProvider: Pass,
  };
});

const MOCK_PROVIDERS = [
  {
    id: "kling",
    name: "Kling",
    family: "Kling",
    type: "video" as const,
    description: "Kling video provider",
    highlight: "",
    costTier: "medium" as const,
    capabilities: ["T2V"],
    maxDuration: 10,
  },
  {
    id: "minimax",
    name: "MiniMax",
    family: "MiniMax",
    type: "video" as const,
    description: "MiniMax video provider",
    highlight: "",
    costTier: "low" as const,
    capabilities: ["T2V"],
    maxDuration: 6,
  },
];

vi.mock("@shared/provider-catalog", () => ({
  getVideoProviders: () => MOCK_PROVIDERS,
  getImageProviders: () => [],
  COST_TIER_LABELS: {
    low: { label: "Low", color: "green" },
    medium: { label: "Medium", color: "yellow" },
    high: { label: "High", color: "red" },
  },
  providerSupportsNativeAudio: () => false,
  providerSupportsMultiImage: () => false,
}));

vi.mock("@shared/provider-config", () => ({
  getMultiImageSupport: () => null,
}));

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(cleanup);

import { ProviderCatalogSelector } from "../provider-catalog-selector";

describe("ProviderCatalogSelector — auto-clear rationale badge", () => {
  it("shows the Why? badge when suzzieRationale is provided", () => {
    render(
      <ProviderCatalogSelector
        outputType="video"
        provider="kling"
        onProviderChange={vi.fn()}
        suzzieRationale="Kling is best for this prompt"
      />,
    );
    expect(screen.getByTestId("provider-catalog-suzzie-badge")).toBeTruthy();
  });

  it("does not show the badge when suzzieRationale is absent", () => {
    render(
      <ProviderCatalogSelector
        outputType="video"
        provider="kling"
        onProviderChange={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("provider-catalog-suzzie-badge")).toBeNull();
  });

  it("clears the badge when user picks a different provider — no parent cooperation", async () => {
    render(
      <ProviderCatalogSelector
        outputType="video"
        provider="kling"
        onProviderChange={vi.fn()}
        suzzieRationale="Kling is best for this prompt"
      />,
    );

    expect(screen.getByTestId("provider-catalog-suzzie-badge")).toBeTruthy();

    // Expand the dropdown by clicking the header row
    const header = screen.getByText("Kling").closest("div[class]")!;
    fireEvent.click(header.parentElement!.parentElement!);

    // Pick a different provider from the dropdown
    const minimaxButton = await screen.findByRole("button", { name: /MiniMax/i });
    fireEvent.click(minimaxButton);

    await waitFor(() => {
      expect(screen.queryByTestId("provider-catalog-suzzie-badge")).toBeNull();
    });
  });

  it("fires onClearRationale when the user picks a provider", async () => {
    const onClearRationale = vi.fn();
    const onProviderChange = vi.fn();

    render(
      <ProviderCatalogSelector
        outputType="video"
        provider="kling"
        onProviderChange={onProviderChange}
        onClearRationale={onClearRationale}
        suzzieRationale="Kling is best for this prompt"
      />,
    );

    // Expand the dropdown
    const header = screen.getByText("Kling").closest("div[class]")!;
    fireEvent.click(header.parentElement!.parentElement!);

    const minimaxButton = await screen.findByRole("button", { name: /MiniMax/i });
    fireEvent.click(minimaxButton);

    await waitFor(() => {
      expect(onClearRationale).toHaveBeenCalledTimes(1);
      expect(onProviderChange).toHaveBeenCalledWith("minimax");
    });
  });

  it("clears the badge when parent resets suzzieRationale to undefined", async () => {
    const { rerender } = render(
      <ProviderCatalogSelector
        outputType="video"
        provider="kling"
        onProviderChange={vi.fn()}
        suzzieRationale="Kling is best for this prompt"
      />,
    );

    expect(screen.getByTestId("provider-catalog-suzzie-badge")).toBeTruthy();

    rerender(
      <ProviderCatalogSelector
        outputType="video"
        provider="kling"
        onProviderChange={vi.fn()}
        suzzieRationale={undefined}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByTestId("provider-catalog-suzzie-badge")).toBeNull();
    });
  });

  it("updates badge content when parent supplies a new rationale", async () => {
    const { rerender } = render(
      <ProviderCatalogSelector
        outputType="video"
        provider="kling"
        onProviderChange={vi.fn()}
        suzzieRationale="First rationale"
      />,
    );

    expect(screen.getByText("First rationale")).toBeTruthy();

    rerender(
      <ProviderCatalogSelector
        outputType="video"
        provider="kling"
        onProviderChange={vi.fn()}
        suzzieRationale="Updated rationale"
      />,
    );

    await waitFor(() => {
      expect(screen.queryByText("First rationale")).toBeNull();
      expect(screen.getByText("Updated rationale")).toBeTruthy();
    });
  });
});
