// @vitest-environment jsdom
//
// Phase 20D (Task #126): SceneDurationControl renders the right control
// per resolved provider:
//   • Seedance 2 → continuous slider 4–15
//   • Other providers → discrete preset buttons (only the values that
//     PROVIDER_RANGES says the model accepts)
//
// We don't try to drive the slider's underlying pointer events (Radix
// uses pointer-event APIs jsdom does not implement). The slider DOM
// presence + readout is enough; per-provider button rendering is the
// regression we actually care about.

import React from "react";
import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

// Radix Slider pulls in @radix-ui/react-use-size, which calls
// `new ResizeObserver(...)` on mount. jsdom doesn't provide one.
beforeAll(() => {

  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

import { SceneDurationControl } from "../scene-duration-control";

afterEach(cleanup);

describe("SceneDurationControl", () => {
  it("renders the slider variant for seedance-2.0", () => {
    render(
      <SceneDurationControl
        provider="seedance-2.0"
        value={8}
        onChange={vi.fn()}
      />,
    );
    expect(
      screen.getByTestId("scene-duration-control-seedance"),
    ).toBeTruthy();
    expect(screen.getByTestId("scene-duration-readout").textContent).toContain(
      "8s",
    );
    expect(
      screen.queryByTestId("scene-duration-control-buttons"),
    ).toBeNull();
  });

  it("renders the slider variant for seedance-2.0-fast", () => {
    render(
      <SceneDurationControl
        provider="seedance-2.0-fast"
        value={12}
        onChange={vi.fn()}
      />,
    );
    expect(
      screen.getByTestId("scene-duration-control-seedance"),
    ).toBeTruthy();
    expect(screen.getByTestId("scene-duration-readout").textContent).toContain(
      "12s",
    );
  });

  it("renders preset buttons for kling (5s, 10s only)", () => {
    render(
      <SceneDurationControl provider="kling" value={5} onChange={vi.fn()} />,
    );
    expect(
      screen.getByTestId("scene-duration-control-buttons"),
    ).toBeTruthy();
    expect(screen.getByTestId("scene-duration-preset-5")).toBeTruthy();
    expect(screen.getByTestId("scene-duration-preset-10")).toBeTruthy();
    // Kling does NOT accept 8s — the legacy stepper would have allowed
    // it, but the new control renders only valid values.
    expect(screen.queryByTestId("scene-duration-preset-8")).toBeNull();
  });

  it("renders all sora-2 presets (4, 8, 12)", () => {
    render(
      <SceneDurationControl provider="sora-2" value={8} onChange={vi.fn()} />,
    );
    expect(screen.getByTestId("scene-duration-preset-4")).toBeTruthy();
    expect(screen.getByTestId("scene-duration-preset-8")).toBeTruthy();
    expect(screen.getByTestId("scene-duration-preset-12")).toBeTruthy();
  });

  it("calls onChange with the preset when a button is clicked", () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    render(
      <SceneDurationControl provider="kling" value={5} onChange={onChange} />,
    );
    fireEvent.click(screen.getByTestId("scene-duration-preset-10"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(10);
  });

  it("does not call onChange when the active preset is re-clicked", () => {
    const onChange = vi.fn();
    render(
      <SceneDurationControl provider="kling" value={5} onChange={onChange} />,
    );
    fireEvent.click(screen.getByTestId("scene-duration-preset-5"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("falls back to a generic preset list for unknown providers", () => {
    render(
      <SceneDurationControl
        provider={"some-future-model" as any}
        value={5}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId("scene-duration-preset-5")).toBeTruthy();
    expect(screen.getByTestId("scene-duration-preset-8")).toBeTruthy();
    expect(screen.getByTestId("scene-duration-preset-10")).toBeTruthy();
  });
});
