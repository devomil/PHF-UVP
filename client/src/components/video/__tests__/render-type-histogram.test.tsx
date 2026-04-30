// @vitest-environment jsdom
//
// Task #119: tests for the project-header render-type histogram and the
// per-scene RenderTypeBadge (display-only) used in the scene list. The
// histogram is the new piece — these tests cover:
//
//  * computeRenderTypeHistogram counts known types correctly and bucket
//    everything else (missing, unknown string, null, undefined) into
//    `unclassified`.
//  * The component hides itself when there are no scenes.
//  * Pills are only rendered for types that are present (zero-count
//    types are not emitted).
//  * The "Reclassify all" button fires the supplied handler exactly
//    once per click and shows the spinner while the promise is in
//    flight.
//  * When ALL scenes are unclassified, a single combined pill is shown
//    instead of N type pills.
//
// We mock the tooltip primitives because @radix-ui's TooltipProvider
// uses pointer-event APIs that jsdom does not implement — keeping them
// as Fragments is enough since the tooltip body is not under test.

import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/components/ui/tooltip", () => {
  const Pass = ({ children }: { children?: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children);
  return {
    Tooltip: Pass,
    TooltipProvider: Pass,
    TooltipTrigger: Pass,
    TooltipContent: Pass,
  };
});
vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children, ...props }: any) =>
    React.createElement("span", props, children),
}));

import {
  RenderTypeHistogram,
  RenderTypeBadge,
  computeRenderTypeHistogram,
} from "@/components/video/render-type-badge";

afterEach(() => cleanup());

describe("computeRenderTypeHistogram", () => {
  it("counts known render types and buckets the rest into unclassified", () => {
    const result = computeRenderTypeHistogram([
      { renderSystemType: "ai_video" },
      { renderSystemType: "ai_video" },
      { renderSystemType: "title_card" },
      { renderSystemType: "infographic" },
      { renderSystemType: "ai_video" },
      // Unclassified buckets — missing, null, unknown string, undefined.
      {},
      { renderSystemType: null },
      { renderSystemType: "made_up_type" },
      { renderSystemType: undefined },
    ]);
    expect(result.counts.ai_video).toBe(3);
    expect(result.counts.title_card).toBe(1);
    expect(result.counts.infographic).toBe(1);
    expect(result.counts.scientific_medical).toBe(0);
    expect(result.counts.brand_environment).toBe(0);
    expect(result.counts.product_showcase).toBe(0);
    expect(result.counts.ugc_avatar).toBe(0);
    expect(result.unclassified).toBe(4);
  });

  it("handles an empty list", () => {
    const r = computeRenderTypeHistogram([]);
    expect(r.unclassified).toBe(0);
    for (const c of Object.values(r.counts)) expect(c).toBe(0);
  });
});

describe("<RenderTypeHistogram />", () => {
  it("renders nothing when there are no scenes", () => {
    const { container } = render(<RenderTypeHistogram scenes={[]} />);
    expect(container.querySelector('[data-testid="render-type-histogram"]')).toBeNull();
  });

  it("renders only present-type pills, plus an Unclassified pill when needed", () => {
    render(
      <RenderTypeHistogram
        scenes={[
          { renderSystemType: "ai_video" },
          { renderSystemType: "ai_video" },
          { renderSystemType: "title_card" },
          { renderSystemType: undefined },
        ]}
      />,
    );
    // Present types render
    const aiPill = screen.getByTestId("render-type-histogram-pill-ai_video");
    expect(aiPill).toBeTruthy();
    expect(aiPill.textContent).toContain("2");
    expect(aiPill.textContent).toContain("AI Video");

    const titlePill = screen.getByTestId("render-type-histogram-pill-title_card");
    expect(titlePill.textContent).toContain("1");
    expect(titlePill.textContent).toContain("Title Card");

    // Unclassified pill rendered
    const unclassified = screen.getByTestId("render-type-histogram-pill-unclassified");
    expect(unclassified.textContent).toContain("1");
    expect(unclassified.textContent).toContain("Unclassified");

    // Zero-count types are NOT rendered
    expect(
      screen.queryByTestId("render-type-histogram-pill-infographic"),
    ).toBeNull();
    expect(
      screen.queryByTestId("render-type-histogram-pill-scientific_medical"),
    ).toBeNull();
  });

  it("collapses to a single pill when every scene is unclassified", () => {
    render(<RenderTypeHistogram scenes={[{}, {}, { renderSystemType: null }]} />);
    expect(
      screen.getByTestId("render-type-histogram-all-unclassified").textContent,
    ).toContain("3 unclassified");
    // No per-type pills rendered.
    expect(screen.queryByTestId("render-type-histogram-pill-ai_video")).toBeNull();
  });

  it("hides the Reclassify-all button when no handler is supplied", () => {
    render(
      <RenderTypeHistogram
        scenes={[{ renderSystemType: "ai_video" }]}
      />,
    );
    expect(screen.queryByTestId("reclassify-all-btn")).toBeNull();
  });

  it("invokes onReclassifyAll exactly once per click and shows a spinner while in flight", async () => {
    let resolveCall!: () => void;
    const handler = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveCall = resolve;
        }),
    );

    render(
      <RenderTypeHistogram
        scenes={[{ renderSystemType: "ai_video" }]}
        onReclassifyAll={handler}
      />,
    );

    const btn = screen.getByTestId("reclassify-all-btn");
    expect(btn.textContent).toContain("Reclassify all");
    expect(screen.queryByTestId("reclassify-all-spinner")).toBeNull();

    fireEvent.click(btn);
    // Spinner appears, button is disabled, label flips.
    await waitFor(() => {
      expect(screen.getByTestId("reclassify-all-spinner")).toBeTruthy();
    });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    expect(btn.textContent).toContain("Reclassifying");

    // A second click while in-flight is a no-op.
    fireEvent.click(btn);
    expect(handler).toHaveBeenCalledTimes(1);

    // Resolve the in-flight promise; spinner clears, button re-enables.
    resolveCall();
    await waitFor(() => {
      expect(screen.queryByTestId("reclassify-all-spinner")).toBeNull();
    });
    expect((btn as HTMLButtonElement).disabled).toBe(false);
    expect(btn.textContent).toContain("Reclassify all");
  });

  it("clears the in-flight spinner via finally (handler-thrown errors)", async () => {
    // We don't use Promise.reject here because the histogram lets the
    // rejection propagate (its contract: callers wrap their fetch in
    // try/catch and toast). Instead we model the realistic shape of a
    // production caller — a handler that catches its own error after
    // toasting — and confirm the finally still resets the spinner.
    const innerError = vi.fn();
    const handler = vi.fn(async () => {
      try {
        throw new Error("boom from network");
      } catch (e) {
        innerError(e);
        // Caller swallowed it — same shape as the project-detail
        // wrapper which catches mutateAsync's rejection after the
        // mutation's onError already fired the toast.
      }
    });

    render(
      <RenderTypeHistogram
        scenes={[{ renderSystemType: "ai_video" }]}
        onReclassifyAll={handler}
      />,
    );

    const btn = screen.getByTestId("reclassify-all-btn");
    fireEvent.click(btn);

    await waitFor(() => {
      expect(screen.queryByTestId("reclassify-all-spinner")).toBeNull();
    });
    expect((btn as HTMLButtonElement).disabled).toBe(false);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(innerError).toHaveBeenCalledTimes(1);
  });
});

// ─── RenderTypeBadge in scene-list usage ────────────────────────────────
// The badge already has its own coverage in the editor; this slimmer
// suite just locks down the contract the scene-list relies on:
//  * No "Reclassify" button when `onReclassify` is omitted
//  * Renders the friendly label for each known type
//  * Falls back to "Unclassified" when type is missing/unknown
describe("<RenderTypeBadge /> (scene-list usage)", () => {
  it("does not render the inline reclassify button when no handler is supplied", () => {
    render(<RenderTypeBadge renderSystemType="ai_video" classifierConfidence={0.9} />);
    expect(screen.queryByTestId("reclassify-scene-btn")).toBeNull();
  });

  it("shows the friendly label for a known render type", () => {
    render(<RenderTypeBadge renderSystemType="title_card" classifierConfidence={0.8} />);
    expect(screen.getByTestId("render-type-badge").textContent).toContain("Title Card");
  });

  it("falls back to Unclassified for unknown / missing types", () => {
    render(<RenderTypeBadge renderSystemType={undefined} />);
    expect(screen.getByTestId("render-type-badge").textContent).toContain("Unclassified");
  });
});
