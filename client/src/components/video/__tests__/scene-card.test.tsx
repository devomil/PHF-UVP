// @vitest-environment jsdom
//
// Task #153: SceneCard wires the resolved provider into both
// SceneDurationControl and NativeAudioToggle. A future refactor could
// silently swap which control is mounted, or stop forwarding the
// provider, and the underlying server tests would still pass — this
// render test is the regression guard for that wiring.
//
// We mock two sibling modules that aren't checked in (scene-card.tsx
// imports from `./content-type-selector` and `./workflow-override-toggle`
// — both resolve to runtime stubs in the actual app build but aren't
// part of the test surface). Mocking them here keeps the render
// focused on the duration/audio controls the task cares about.

import React from "react";
import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("../content-type-selector", () => {
  const Stub = (): React.ReactElement =>
    React.createElement("div", { "data-testid": "stub-content-type-selector" });
  return {
    ContentTypeSelector: Stub,
    getContentTypeIcon: (): React.ReactNode => null,
  };
});

vi.mock("../workflow-override-toggle", () => {
  const Stub = (): React.ReactElement =>
    React.createElement("div", { "data-testid": "stub-workflow-override" });
  return { WorkflowOverrideCompact: Stub };
});

vi.mock("../visual-direction-editor", () => {
  const Stub = (): React.ReactElement =>
    React.createElement("div", { "data-testid": "stub-visual-direction" });
  return { VisualDirectionEditor: Stub };
});

vi.mock("@/hooks/use-toast", () => ({
  useToast: (): { toast: () => void } => ({ toast: vi.fn() }),
}));

beforeAll(() => {
  // Radix Slider needs ResizeObserver in jsdom.

  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
});

import { SceneCard } from "../scene-card";

afterEach(cleanup);

// Local mirror of the Scene shape SceneCard reads. Kept in lockstep
// with the `interface Scene` declared in scene-card.tsx so the tests
// don't need `as any` to construct fixtures.
type SceneFixture = {
  id: string;
  type: string;
  narration: string;
  duration: number;
  videoProvider?: string;
};

function makeScene(overrides: Partial<SceneFixture> = {}): SceneFixture {
  return {
    id: "s1",
    type: "hook",
    narration: "An opening line that sets the scene.",
    duration: 8,
    ...overrides,
  };
}

const noopUpdate = (): Promise<void> => Promise.resolve();

describe("SceneCard — duration + audio control wiring (Task #153)", () => {
  it("mounts SceneDurationControl with provider=seedance-2.0 and an enabled NativeAudioToggle", () => {
    render(
      <SceneCard
        scene={makeScene({ videoProvider: "seedance-2.0" })}
        index={0}
        onUpdate={noopUpdate}
        expanded
      />,
    );

    // Seedance 2 → slider variant of SceneDurationControl is present.
    expect(
      screen.getByTestId("scene-duration-control-seedance"),
    ).toBeTruthy();
    // And it picked up the scene's duration value.
    expect(
      screen.getByTestId("scene-duration-readout").textContent,
    ).toContain("8s");
    // The button-preset variant must NOT be mounted at the same time.
    expect(
      screen.queryByTestId("scene-duration-control-buttons"),
    ).toBeNull();

    // Native-audio toggle is enabled (Seedance 2 supports native audio).
    const sw = screen.getByTestId(
      "scene-native-audio-switch",
    ) as HTMLButtonElement;
    expect(sw.disabled).toBe(false);
    expect(
      screen.queryByTestId("scene-native-audio-disabled-wrap"),
    ).toBeNull();
  });

  it("mounts SceneDurationControl preset variant for kling and renders a disabled NativeAudioToggle", () => {
    render(
      <SceneCard
        scene={makeScene({ duration: 5, videoProvider: "kling" })}
        index={0}
        onUpdate={noopUpdate}
        expanded
      />,
    );

    // Kling → preset-button variant of SceneDurationControl.
    expect(
      screen.getByTestId("scene-duration-control-buttons"),
    ).toBeTruthy();
    expect(screen.getByTestId("scene-duration-preset-5")).toBeTruthy();
    expect(screen.getByTestId("scene-duration-preset-10")).toBeTruthy();
    // Slider variant must NOT be mounted.
    expect(
      screen.queryByTestId("scene-duration-control-seedance"),
    ).toBeNull();

    // Kling is not audio-capable → toggle is disabled and wrapped
    // with the disabled-tooltip wrap.
    const sw = screen.getByTestId(
      "scene-native-audio-switch",
    ) as HTMLButtonElement;
    expect(sw.disabled).toBe(true);
    expect(
      screen.getByTestId("scene-native-audio-disabled-wrap"),
    ).toBeTruthy();
  });

  it("falls back to projectPreferredProvider when the scene has no per-scene pin", () => {
    render(
      <SceneCard
        scene={makeScene()}
        index={0}
        onUpdate={noopUpdate}
        projectPreferredProvider="seedance-2.0-fast"
        expanded
      />,
    );

    // Project-level preferred provider is Seedance 2 Fast → slider
    // variant should be selected.
    expect(
      screen.getByTestId("scene-duration-control-seedance"),
    ).toBeTruthy();
    // And the audio toggle should be enabled.
    expect(
      (screen.getByTestId("scene-native-audio-switch") as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });
});
