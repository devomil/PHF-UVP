// @vitest-environment jsdom
//
// Phase 20D (Task #126): SceneDefaultsBulkAction sanity checks. The
// only behavior we strictly own is "exactly one PUT call goes out per
// confirmed apply, with the mutated scenes array in the body". The
// rest is glue around themed primitives.

import React from "react";
import {
  describe,
  it,
  expect,
  vi,
  afterEach,
  beforeAll,
  beforeEach,
} from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from "@testing-library/react";

const apiRequestMock = vi.fn().mockResolvedValue({ ok: true });
const toastMock = vi.fn();

vi.mock("@/lib/queryClient", () => ({
  apiRequest: (...args: any[]) => apiRequestMock(...args),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

beforeAll(() => {

  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

beforeEach(() => {
  apiRequestMock.mockClear();
  toastMock.mockClear();
});

afterEach(cleanup);

import { SceneDefaultsBulkAction } from "../scene-defaults-bulk-action";
import type { Scene } from "@shared/video-types";
import { VIDEO_PROVIDER_CATALOG } from "@shared/provider-catalog";

// Minimal Scene shapes for the bulk-action's contract — id + duration
// + the new generateNativeAudio flag are all the component reads.
// `Partial<Scene>` lets us avoid filling in every unrelated field.
const SCENES: Partial<Scene>[] = [
  { id: "s1", duration: 5, generateNativeAudio: false },
  { id: "s2", duration: 7 },
  { id: "s3", duration: 12, generateNativeAudio: true },
];

describe("SceneDefaultsBulkAction", () => {
  it("disables the trigger when there are no scenes", () => {
    render(<SceneDefaultsBulkAction projectId="p1" scenes={[]} />);
    const trigger = screen.getByTestId(
      "scene-defaults-bulk-trigger",
    ) as HTMLButtonElement;
    expect(trigger.disabled).toBe(true);
  });

  it("issues exactly ONE PUT with the mutated scenes array on confirm", async () => {
    const onUpdated = vi.fn();
    render(
      <SceneDefaultsBulkAction
        projectId="p1"
        scenes={SCENES as Scene[]}
        onUpdated={onUpdated}
      />,
    );

    fireEvent.click(screen.getByTestId("scene-defaults-bulk-trigger"));
    fireEvent.click(await screen.findByTestId("scene-defaults-preset-8"));
    // turn the audio "set" on AND its value on
    fireEvent.click(screen.getByTestId("scene-defaults-audio-set-switch"));
    const audioValueSwitch = await screen.findByTestId(
      "scene-defaults-audio-value-switch",
    );
    fireEvent.click(audioValueSwitch);

    fireEvent.click(screen.getByTestId("scene-defaults-apply-button"));
    fireEvent.click(
      await screen.findByTestId("scene-defaults-confirm-action"),
    );

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledTimes(1);
    });

    const [method, url, body] = apiRequestMock.mock.calls[0];
    expect(method).toBe("PUT");
    expect(url).toBe("/api/universal-video/projects/p1/scenes");
    expect(body.scenes).toHaveLength(3);
    expect(body.scenes.every((s: any) => s.duration === 8)).toBe(true);
    expect(body.scenes.every((s: any) => s.generateNativeAudio === true)).toBe(
      true,
    );
    expect(onUpdated).toHaveBeenCalledTimes(1);
  });

  it("Apply button is disabled when nothing has been picked", async () => {
    render(<SceneDefaultsBulkAction projectId="p1" scenes={SCENES as Scene[]} />);
    fireEvent.click(screen.getByTestId("scene-defaults-bulk-trigger"));
    const apply = (await screen.findByTestId(
      "scene-defaults-apply-button",
    )) as HTMLButtonElement;
    expect(apply.disabled).toBe(true);
  });

  it("shows the new project-total cost preview when a duration is picked", async () => {
    // seedance-2.0-fast = $0.020/s.
    // 3 scenes × 8s × $0.020 = $0.48 new total.
    // Current total = (5 + 7 + 12)s × $0.020 = $0.48… coincidence-prone,
    // so use a non-overlapping preset (12s) to keep the assertions tight.
    render(
      <SceneDefaultsBulkAction
        projectId="p1"
        scenes={SCENES as Scene[]}
        projectPreferredProvider="seedance-2.0-fast"
      />,
    );
    fireEvent.click(screen.getByTestId("scene-defaults-bulk-trigger"));
    // No duration picked yet → preview is hidden.
    expect(screen.queryByTestId("scene-defaults-cost-preview")).toBeNull();

    fireEvent.click(await screen.findByTestId("scene-defaults-preset-12"));
    const preview = await screen.findByTestId("scene-defaults-cost-preview");
    // 3 scenes × 12s × $0.020/s = $0.72 new total.
    expect(preview.textContent).toContain("0.72");
    expect(preview.textContent).toContain("New project total");
    // Current total = (5 + 7 + 12) × $0.020 = $0.48.
    expect(preview.textContent).toContain("0.48");
  });

  it("hides the cost preview when no provider is supplied", async () => {
    render(
      <SceneDefaultsBulkAction projectId="p1" scenes={SCENES as Scene[]} />,
    );
    fireEvent.click(screen.getByTestId("scene-defaults-bulk-trigger"));
    fireEvent.click(await screen.findByTestId("scene-defaults-preset-8"));
    expect(screen.queryByTestId("scene-defaults-cost-preview")).toBeNull();
  });

  it("only updates duration when audio set is off", async () => {
    render(<SceneDefaultsBulkAction projectId="p1" scenes={SCENES as Scene[]} />);
    fireEvent.click(screen.getByTestId("scene-defaults-bulk-trigger"));
    fireEvent.click(await screen.findByTestId("scene-defaults-preset-12"));
    fireEvent.click(screen.getByTestId("scene-defaults-apply-button"));
    fireEvent.click(
      await screen.findByTestId("scene-defaults-confirm-action"),
    );

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledTimes(1);
    });

    const body = apiRequestMock.mock.calls[0][2];
    expect(body.scenes.every((s: any) => s.duration === 12)).toBe(true);
    // generateNativeAudio should be unchanged from the original scenes.
    expect(body.scenes[0].generateNativeAudio).toBe(false);
    expect(body.scenes[1].generateNativeAudio).toBeUndefined();
    expect(body.scenes[2].generateNativeAudio).toBe(true);
  });

  // Task #128: scope = "Selected scenes" must only PUT the chosen ids.
  it("scope=selected sends only the picked scene ids", async () => {
    render(<SceneDefaultsBulkAction projectId="p1" scenes={SCENES as Scene[]} />);
    fireEvent.click(screen.getByTestId("scene-defaults-bulk-trigger"));
    fireEvent.click(await screen.findByTestId("scene-defaults-preset-8"));
    fireEvent.click(screen.getByTestId("scene-defaults-scope-selected"));
    fireEvent.click(
      await screen.findByTestId("scene-defaults-picker-checkbox-s1"),
    );
    fireEvent.click(screen.getByTestId("scene-defaults-picker-checkbox-s3"));

    fireEvent.click(screen.getByTestId("scene-defaults-apply-button"));
    fireEvent.click(
      await screen.findByTestId("scene-defaults-confirm-action"),
    );

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledTimes(1);
    });

    const body = apiRequestMock.mock.calls[0][2];
    expect(body.scenes.map((s: any) => s.id)).toEqual(["s1", "s3"]);
    expect(body.scenes.every((s: any) => s.duration === 8)).toBe(true);
  });

  // Task #128: scope = "untouched" should match scenes still on the
  // project's modal/most-common value for the field being changed.
  // SCENES has durations [5, 7, 12]; 5/7/12 each appear once so the
  // mode-of pick falls back to the first one (5), so only s1 should
  // be considered untouched.
  it("scope=untouched only sends scenes still on the modal default", async () => {
    const SC: Partial<Scene>[] = [
      { id: "a", duration: 5 },
      { id: "b", duration: 5 },
      { id: "c", duration: 5 },
      { id: "d", duration: 8 },
    ];
    render(<SceneDefaultsBulkAction projectId="p1" scenes={SC as Scene[]} />);
    fireEvent.click(screen.getByTestId("scene-defaults-bulk-trigger"));
    fireEvent.click(await screen.findByTestId("scene-defaults-preset-12"));
    fireEvent.click(screen.getByTestId("scene-defaults-scope-untouched"));

    fireEvent.click(screen.getByTestId("scene-defaults-apply-button"));
    fireEvent.click(
      await screen.findByTestId("scene-defaults-confirm-action"),
    );

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledTimes(1);
    });

    const body = apiRequestMock.mock.calls[0][2];
    expect(body.scenes.map((s: any) => s.id)).toEqual(["a", "b", "c"]);
    expect(body.scenes.every((s: any) => s.duration === 12)).toBe(true);
  });

  // Task #141: the "native audio is only honored by …" warning must
  // derive its model list from VIDEO_PROVIDER_CATALOG (Task #138). If a
  // future contributor reintroduces a hardcoded literal like
  // "Seedance 2" — or drops a model from the rendered list — this
  // test catches it. We trigger the warning with a non-audio provider
  // (`pika`) and assert the rendered string contains every catalog
  // entry whose `supportsNativeAudio === true`.
  it("audio-ignored warning lists every catalog model with supportsNativeAudio", async () => {
    render(
      <SceneDefaultsBulkAction
        projectId="p1"
        scenes={SCENES as Scene[]}
        projectPreferredProvider="pika"
      />,
    );
    fireEvent.click(screen.getByTestId("scene-defaults-bulk-trigger"));
    fireEvent.click(screen.getByTestId("scene-defaults-audio-set-switch"));
    fireEvent.click(
      await screen.findByTestId("scene-defaults-audio-value-switch"),
    );

    const warning = await screen.findByTestId("scene-defaults-audio-warning");
    const audioCapable = VIDEO_PROVIDER_CATALOG.filter(
      (p) => p.supportsNativeAudio,
    );
    // Sanity: the catalog must actually have audio-capable entries,
    // otherwise this test would silently pass on a misconfigured catalog.
    expect(audioCapable.length).toBeGreaterThan(0);
    for (const entry of audioCapable) {
      expect(warning.textContent).toContain(entry.name);
    }
    // And it must not contain a stale literal for any model that is
    // NOT currently flagged as audio-capable in the catalog. We check
    // "Seedance 2" specifically because that was the original
    // hardcoded string Task #138 removed — but only if the catalog
    // itself no longer marks any "Seedance 2"-named entry as
    // audio-capable.
    const seedance2StillAudio = audioCapable.some(
      (p) => p.name === "Seedance 2",
    );
    if (!seedance2StillAudio) {
      expect(warning.textContent).not.toContain("Seedance 2");
    }
  });

  it("apply button is disabled when scope=selected and nothing is checked", async () => {
    render(<SceneDefaultsBulkAction projectId="p1" scenes={SCENES as Scene[]} />);
    fireEvent.click(screen.getByTestId("scene-defaults-bulk-trigger"));
    fireEvent.click(await screen.findByTestId("scene-defaults-preset-8"));
    fireEvent.click(screen.getByTestId("scene-defaults-scope-selected"));
    const apply = (await screen.findByTestId(
      "scene-defaults-apply-button",
    )) as HTMLButtonElement;
    expect(apply.disabled).toBe(true);
  });
});
