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
