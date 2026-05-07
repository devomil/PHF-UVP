// @vitest-environment jsdom
//
// Task #153: regression guard for the project-header mount of
// SceneDefaultsBulkAction. project-detail.tsx renders this section
// only when:
//   • the project is NOT a Studio Polish project, AND
//   • the project has at least one scene.
//
// A future refactor of project-detail could silently drop the mount
// or invert the conditions and the rest of the suite would still be
// green — these tests pin the contract.

import React from "react";
import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("@/lib/queryClient", () => ({
  apiRequest: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: (): { toast: () => void } => ({ toast: vi.fn() }),
}));

beforeAll(() => {

  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
});

import { ProjectSceneDefaultsSection } from "../project-scene-defaults-section";
import type { Scene } from "@shared/video-types";

// Typed Scene factory. The header bulk-action only reads `id`,
// `duration`, and `generateNativeAudio`; the rest of the Scene shape
// has to satisfy the full interface, so we stub the structural fields
// (background, transitions, textOverlays) with valid empty defaults.
function makeScene(overrides: Partial<Scene> & Pick<Scene, "id" | "duration">): Scene {
  const base: Scene = {
    id: overrides.id,
    order: 0,
    type: "hook",
    duration: overrides.duration,
    narration: "",
    textOverlays: [],
    background: { type: "solid", source: "#000000" },
    transitionIn: { type: "fade", duration: 0.5, easing: "ease-in-out" },
    transitionOut: { type: "fade", duration: 0.5, easing: "ease-in-out" },
  };
  return { ...base, ...overrides };
}

const SCENES: Scene[] = [
  makeScene({ id: "s1", duration: 5 }),
  makeScene({ id: "s2", duration: 8 }),
];

afterEach(cleanup);

describe("ProjectSceneDefaultsSection — header mount gate (Task #153)", () => {
  it("renders SceneDefaultsBulkAction when !isStudioPolish && scenes.length > 0", () => {
    render(
      <ProjectSceneDefaultsSection
        isStudioPolish={false}
        projectId="p1"
        scenes={SCENES}
      />,
    );
    expect(
      screen.getByTestId("project-scene-defaults-section"),
    ).toBeTruthy();
    // The bulk-action's own trigger must be reachable — proves the
    // child component is actually mounted, not just the wrapper div.
    expect(screen.getByTestId("scene-defaults-bulk-trigger")).toBeTruthy();
  });

  it("does NOT render when the project is Studio Polish", () => {
    render(
      <ProjectSceneDefaultsSection
        isStudioPolish={true}
        projectId="p1"
        scenes={SCENES}
      />,
    );
    expect(
      screen.queryByTestId("project-scene-defaults-section"),
    ).toBeNull();
    expect(screen.queryByTestId("scene-defaults-bulk-trigger")).toBeNull();
  });

  it("does NOT render when the project has no scenes yet", () => {
    render(
      <ProjectSceneDefaultsSection
        isStudioPolish={false}
        projectId="p1"
        scenes={[]}
      />,
    );
    expect(
      screen.queryByTestId("project-scene-defaults-section"),
    ).toBeNull();
    expect(screen.queryByTestId("scene-defaults-bulk-trigger")).toBeNull();
  });

  it("forwards projectPreferredProvider through to the bulk action", () => {
    // Easiest proof that the prop made it through: the cost preview
    // inside the bulk action is hidden when no provider is supplied
    // (see scene-defaults-bulk-action tests). Here we just assert the
    // mount works with the provider present — the deeper preview path
    // is covered by the bulk-action's own tests.
    render(
      <ProjectSceneDefaultsSection
        isStudioPolish={false}
        projectId="p1"
        scenes={SCENES}
        projectPreferredProvider="seedance-2.0-fast"
      />,
    );
    expect(
      screen.getByTestId("project-scene-defaults-section"),
    ).toBeTruthy();
    expect(screen.getByTestId("scene-defaults-bulk-trigger")).toBeTruthy();
  });
});
