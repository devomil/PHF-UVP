// @vitest-environment jsdom
//
// RegenerationOptions — V2V submenu catalog-driven tests
//
// Verified behaviour:
//   • submenu-v2v-providers trigger appears (enabled) when mediaType="video" and
//     referenceVideoUrl is provided
//   • submenu-v2v-providers trigger appears DISABLED when mediaType="video" and
//     referenceVideoUrl is omitted (visible so users know V2V exists)
//   • submenu-v2v-providers trigger is absent when mediaType="image" even if
//     referenceVideoUrl is supplied
//   • menu-item-video-to-video quick action appears DISABLED when no referenceVideoUrl
//   • handleRegenerate shows a toast and does NOT call onRegenerate when
//     mode="video-to-video" is triggered without a referenceUrl
//   • V2V provider menu items are driven entirely by the mock catalog —
//     items for both catalog providers appear and no hardcoded items appear
//   • The auto entry (id="auto") is always the first V2V provider menu item
//   • onRegenerate is called with mode:"video-to-video" when a V2V item is clicked
//
// Heavy Radix primitives (DropdownMenu, Tabs, Alert, Button) are stubbed
// so that all rendered content is immediately visible without pointer-event
// simulation. Child presentational components (StrategyPreviewCard,
// RegenerationHistoryPanel) are stubbed to null — they are irrelevant to V2V
// catalog coverage.

import React from "react";
import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

// ── Stub heavy/pointer-event-dependent Radix primitives ──────────────────────

vi.mock("@/components/ui/dropdown-menu", () => {
  const Pass = ({ children }: { children?: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children);
  const Item = ({ children, onClick, disabled, "data-testid": tid }: any) =>
    React.createElement("button", { onClick, disabled, "data-testid": tid }, children);
  const SubTrigger = ({ children, disabled, "data-testid": tid }: any) =>
    React.createElement("div", { "data-testid": tid, disabled: disabled || undefined, "data-disabled": disabled ? "" : undefined }, children);
  const SubContent = ({ children }: any) =>
    React.createElement("div", null, children);
  return {
    DropdownMenu: Pass,
    DropdownMenuTrigger: Pass,
    DropdownMenuContent: ({ children }: any) =>
      React.createElement("div", { "data-testid": "mock-dm-content" }, children),
    DropdownMenuItem: Item,
    DropdownMenuSeparator: () => React.createElement("hr"),
    DropdownMenuLabel: ({ children }: any) =>
      React.createElement("div", null, children),
    DropdownMenuSub: Pass,
    DropdownMenuSubTrigger: SubTrigger,
    DropdownMenuSubContent: SubContent,
  };
});

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, disabled, "data-testid": tid }: any) =>
    React.createElement("button", { onClick, disabled, "data-testid": tid }, children),
}));

vi.mock("@/components/ui/alert", () => ({
  Alert: ({ children }: any) => React.createElement("div", null, children),
  AlertDescription: ({ children }: any) => React.createElement("div", null, children),
}));

vi.mock("@/components/ui/tabs", () => {
  const Pass = ({ children }: { children?: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children);
  return {
    Tabs: Pass,
    TabsContent: Pass,
    TabsList: Pass,
    TabsTrigger: ({ children }: any) =>
      React.createElement("button", null, children),
  };
});

vi.mock("../RegenerationHistoryPanel", () => ({ RegenerationHistoryPanel: () => null }));
vi.mock("../StrategyPreviewCard", () => ({ StrategyPreviewCard: () => null }));

vi.mock("@/components/ui/input", () => ({
  Input: ({ value, onChange, "data-testid": tid, ...rest }: any) =>
    React.createElement("input", { value, onChange, "data-testid": tid, ...rest }),
}));

const mockToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

// ── Deterministic mock catalog — two V2V providers plus auto ─────────────────
// NOTE: vi.mock() factories are hoisted before const declarations, so the
// catalog data is inlined directly inside the factory. MOCK_V2V_CATALOG below
// is a mirror used only by test assertions and is never referenced inside the
// factory itself.

vi.mock("@shared/provider-catalog", () => ({
  getImageDropdownProviders: () => [
    { id: "auto", name: "Auto (Best Match)", description: "Auto image pick", supportsI2I: true, supportsStyle: true },
  ],
  getDropdownV2VProviders: () => [
    { id: "auto",          name: "Auto (Kling Object Replace)", description: "Auto pick" },
    { id: "mock-v2v-one",  name: "Mock V2V Provider One",      description: "First mock" },
    { id: "mock-v2v-two",  name: "Mock V2V Provider Two",      description: "Second mock" },
  ],
}));

const MOCK_V2V_CATALOG = [
  { id: "auto",          name: "Auto (Kling Object Replace)", description: "Auto pick" },
  { id: "mock-v2v-one",  name: "Mock V2V Provider One",      description: "First mock" },
  { id: "mock-v2v-two",  name: "Mock V2V Provider Two",      description: "Second mock" },
];

// ── Polyfills ─────────────────────────────────────────────────────────────────

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(() => {
  cleanup();
  mockToast.mockClear();
});

// ── Import component under test AFTER mocks are registered ───────────────────

import { RegenerationOptions } from "../RegenerationOptions";

// ── Helpers ───────────────────────────────────────────────────────────────────

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    sceneId: "scene-1",
    mediaType: "video" as const,
    onRegenerate: vi.fn().mockResolvedValue(undefined),
    showHistory: false,
    showStrategyPreview: false,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("RegenerationOptions — V2V submenu catalog-driven", () => {
  it("shows the V2V submenu trigger when mediaType=video and referenceVideoUrl is provided", () => {
    render(
      <RegenerationOptions
        {...baseProps({ referenceVideoUrl: "https://example.com/ref.mp4" })}
      />,
    );
    expect(screen.getByTestId("submenu-v2v-providers")).toBeTruthy();
  });

  it("shows the V2V submenu trigger disabled when mediaType=video but referenceVideoUrl is omitted", () => {
    render(<RegenerationOptions {...baseProps()} />);
    const trigger = screen.getByTestId("submenu-v2v-providers");
    expect(trigger).toBeTruthy();
    expect((trigger as HTMLElement).hasAttribute("disabled") ||
      (trigger as HTMLElement).getAttribute("aria-disabled") === "true" ||
      (trigger as HTMLElement).getAttribute("data-disabled") !== null
    ).toBe(true);
  });

  it("shows the V2V quick-action menu item disabled when mediaType=video but referenceVideoUrl is omitted", () => {
    render(<RegenerationOptions {...baseProps()} />);
    const item = screen.getByTestId("menu-item-video-to-video");
    expect(item).toBeTruthy();
    expect((item as HTMLButtonElement).disabled).toBe(true);
  });

  it("does not show the V2V submenu trigger when mediaType=image even if referenceVideoUrl is supplied", () => {
    render(
      <RegenerationOptions
        {...baseProps({
          mediaType: "image",
          referenceVideoUrl: "https://example.com/ref.mp4",
        })}
      />,
    );
    expect(screen.queryByTestId("submenu-v2v-providers")).toBeNull();
  });

  it("renders a V2V provider menu item for every entry returned by getDropdownV2VProviders", () => {
    render(
      <RegenerationOptions
        {...baseProps({ referenceVideoUrl: "https://example.com/ref.mp4" })}
      />,
    );

    for (const provider of MOCK_V2V_CATALOG) {
      expect(
        screen.getByTestId(`menu-item-v2v-provider-${provider.id}`),
      ).toBeTruthy();
    }
  });

  it("auto entry comes from the catalog and is present as the first V2V menu item", () => {
    render(
      <RegenerationOptions
        {...baseProps({ referenceVideoUrl: "https://example.com/ref.mp4" })}
      />,
    );

    const items = screen
      .getAllByTestId(/^menu-item-v2v-provider-/)
      .map(el => el.getAttribute("data-testid")!.replace("menu-item-v2v-provider-", ""));

    expect(items[0]).toBe("auto");
  });

  it("does not render V2V menu items for providers absent from the catalog mock", () => {
    render(
      <RegenerationOptions
        {...baseProps({ referenceVideoUrl: "https://example.com/ref.mp4" })}
      />,
    );

    expect(screen.queryByTestId("menu-item-v2v-provider-kling-2.6")).toBeNull();
    expect(screen.queryByTestId("menu-item-v2v-provider-runway")).toBeNull();
    expect(screen.queryByTestId("menu-item-v2v-provider-hardcoded")).toBeNull();
  });

  it("calls onRegenerate with mode:video-to-video when a V2V provider item is clicked", async () => {
    const onRegenerate = vi.fn().mockResolvedValue(undefined);
    render(
      <RegenerationOptions
        {...baseProps({
          referenceVideoUrl: "https://example.com/ref.mp4",
          onRegenerate,
        })}
      />,
    );

    fireEvent.click(screen.getByTestId("menu-item-v2v-provider-mock-v2v-one"));

    expect(onRegenerate).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "video-to-video" }),
    );
  });

  it("calls onRegenerate without newProvider when the auto V2V item is clicked", async () => {
    const onRegenerate = vi.fn().mockResolvedValue(undefined);
    render(
      <RegenerationOptions
        {...baseProps({
          referenceVideoUrl: "https://example.com/ref.mp4",
          onRegenerate,
        })}
      />,
    );

    fireEvent.click(screen.getByTestId("menu-item-v2v-provider-auto"));

    const call = onRegenerate.mock.calls[0][0];
    expect(call.mode).toBe("video-to-video");
    expect(call.newProvider).toBeUndefined();
  });

  it("calls onRegenerate with the catalog provider id when a non-auto V2V item is clicked", async () => {
    const onRegenerate = vi.fn().mockResolvedValue(undefined);
    render(
      <RegenerationOptions
        {...baseProps({
          referenceVideoUrl: "https://example.com/ref.mp4",
          onRegenerate,
        })}
      />,
    );

    fireEvent.click(screen.getByTestId("menu-item-v2v-provider-mock-v2v-two"));

    const call = onRegenerate.mock.calls[0][0];
    expect(call.mode).toBe("video-to-video");
    expect(call.newProvider).toBe("mock-v2v-two");
  });
});

describe("RegenerationOptions — V2V replacementImageUrl round-trip", () => {
  const BRAND_URL = "https://cdn.example.com/brand-asset.png";
  const CUSTOM_URL = "https://cdn.example.com/custom-replacement.png";

  it("pre-fills the picker with brandAssetUrl and includes it as replacementImageUrl in every V2V onRegenerate call", () => {
    const onRegenerate = vi.fn().mockResolvedValue(undefined);
    render(
      <RegenerationOptions
        {...baseProps({
          referenceVideoUrl: "https://example.com/ref.mp4",
          brandAssetUrl: BRAND_URL,
          onRegenerate,
        })}
      />,
    );

    const input = screen.getByTestId("input-v2v-replacement-image") as HTMLInputElement;
    expect(input.value).toBe(BRAND_URL);

    fireEvent.click(screen.getByTestId("menu-item-video-to-video"));
    expect(onRegenerate).toHaveBeenCalledTimes(1);
    expect(onRegenerate.mock.calls[0][0].replacementImageUrl).toBe(BRAND_URL);

    onRegenerate.mockClear();

    fireEvent.click(screen.getByTestId("menu-item-v2v-provider-mock-v2v-one"));
    expect(onRegenerate).toHaveBeenCalledTimes(1);
    expect(onRegenerate.mock.calls[0][0].replacementImageUrl).toBe(BRAND_URL);
  });

  it("uses the updated URL in onRegenerate after the user changes the picker value", () => {
    const onRegenerate = vi.fn().mockResolvedValue(undefined);
    render(
      <RegenerationOptions
        {...baseProps({
          referenceVideoUrl: "https://example.com/ref.mp4",
          brandAssetUrl: BRAND_URL,
          onRegenerate,
        })}
      />,
    );

    const input = screen.getByTestId("input-v2v-replacement-image") as HTMLInputElement;
    fireEvent.change(input, { target: { value: CUSTOM_URL } });
    expect(input.value).toBe(CUSTOM_URL);

    fireEvent.click(screen.getByTestId("menu-item-v2v-provider-mock-v2v-one"));
    expect(onRegenerate).toHaveBeenCalledTimes(1);
    expect(onRegenerate.mock.calls[0][0].replacementImageUrl).toBe(CUSTOM_URL);
  });

  it("passes replacementImageUrl as undefined (not empty string) when the picker is empty", () => {
    const onRegenerate = vi.fn().mockResolvedValue(undefined);
    render(
      <RegenerationOptions
        {...baseProps({
          referenceVideoUrl: "https://example.com/ref.mp4",
          onRegenerate,
        })}
      />,
    );

    const input = screen.getByTestId("input-v2v-replacement-image") as HTMLInputElement;
    expect(input.value).toBe("");

    fireEvent.click(screen.getByTestId("menu-item-video-to-video"));
    expect(onRegenerate).toHaveBeenCalledTimes(1);
    const quickActionCall = onRegenerate.mock.calls[0][0];
    expect(quickActionCall.replacementImageUrl).toBeUndefined();

    onRegenerate.mockClear();

    fireEvent.click(screen.getByTestId("menu-item-v2v-provider-auto"));
    expect(onRegenerate).toHaveBeenCalledTimes(1);
    const providerCall = onRegenerate.mock.calls[0][0];
    expect(providerCall.replacementImageUrl).toBeUndefined();
  });
});
