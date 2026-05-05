// @vitest-environment jsdom
//
// NativeAudioToggle behavior matrix:
//   • Disabled + tooltip wrap when provider isn't audio-capable
//   • Seedance 2 (T2V or I2V) is always audio-capable
//   • Veo I2V is audio-capable ONLY when an image is attached
//     (Task #137 — Veo T2V hard-codes generate_audio:false on the wire)
//   • Conflict warning shown only when (audio-capable && value && hasVoiceover)
//   • "Mute voiceover" opens a themed AlertDialog (not window.confirm)
//   • Confirming the AlertDialog calls onMuteVoiceover exactly once
//
// We mock the tooltip primitives because Radix's TooltipProvider uses
// pointer-event APIs jsdom doesn't implement. The AlertDialog primitive
// is exercised end-to-end so we cover the lint:dialogs constraint.

import React from "react";
import {
  describe,
  it,
  expect,
  vi,
  afterEach,
  beforeAll,
} from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from "@testing-library/react";

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

beforeAll(() => {
  // Radix AlertDialog touches pointer-event/scroll APIs that jsdom
  // doesn't implement. ResizeObserver is the most common missing one.

  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

import { NativeAudioToggle } from "../native-audio-toggle";

afterEach(cleanup);

describe("NativeAudioToggle", () => {
  it("renders disabled with tooltip wrap when provider isn't Seedance 2", () => {
    render(
      <NativeAudioToggle
        provider="kling"
        value={false}
        hasVoiceover={false}
        onChange={vi.fn()}
      />,
    );
    const sw = screen.getByTestId(
      "scene-native-audio-switch",
    ) as HTMLButtonElement;
    expect(sw.disabled).toBe(true);
    expect(
      screen.getByTestId("scene-native-audio-disabled-wrap"),
    ).toBeTruthy();
    // No conflict warning when toggle is off / not Seedance 2.
    expect(
      screen.queryByTestId("scene-native-audio-conflict"),
    ).toBeNull();
  });

  it("is enabled for seedance-2.0 and seedance-2.0-fast", () => {
    const { rerender } = render(
      <NativeAudioToggle
        provider="seedance-2.0"
        value={false}
        hasVoiceover={false}
        onChange={vi.fn()}
      />,
    );
    expect(
      (screen.getByTestId("scene-native-audio-switch") as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    expect(
      screen.queryByTestId("scene-native-audio-disabled-wrap"),
    ).toBeNull();

    rerender(
      <NativeAudioToggle
        provider="seedance-2.0-fast"
        value={false}
        hasVoiceover={false}
        onChange={vi.fn()}
      />,
    );
    expect(
      (screen.getByTestId("scene-native-audio-switch") as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it("shows the conflict warning only when toggle is on AND voiceover exists", () => {
    const { rerender } = render(
      <NativeAudioToggle
        provider="seedance-2.0"
        value={false}
        hasVoiceover={true}
        onChange={vi.fn()}
      />,
    );
    expect(
      screen.queryByTestId("scene-native-audio-conflict"),
    ).toBeNull();

    rerender(
      <NativeAudioToggle
        provider="seedance-2.0"
        value={true}
        hasVoiceover={false}
        onChange={vi.fn()}
      />,
    );
    expect(
      screen.queryByTestId("scene-native-audio-conflict"),
    ).toBeNull();

    rerender(
      <NativeAudioToggle
        provider="seedance-2.0"
        value={true}
        hasVoiceover={true}
        onChange={vi.fn()}
      />,
    );
    expect(
      screen.queryByTestId("scene-native-audio-conflict"),
    ).toBeTruthy();
  });

  it("opens the themed AlertDialog from the warning and confirms muting", async () => {
    const onMute = vi.fn().mockResolvedValue(undefined);
    render(
      <NativeAudioToggle
        provider="seedance-2.0"
        value={true}
        hasVoiceover={true}
        onChange={vi.fn()}
        onMuteVoiceover={onMute}
      />,
    );

    fireEvent.click(screen.getByTestId("scene-native-audio-mute-voiceover"));

    // AlertDialog content is portaled — wait for it to appear.
    const action = await screen.findByTestId(
      "scene-native-audio-mute-confirm-action",
    );
    fireEvent.click(action);

    await waitFor(() => {
      expect(onMute).toHaveBeenCalledTimes(1);
    });
  });

  it("calls onChange when the switch is flipped", async () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    render(
      <NativeAudioToggle
        provider="seedance-2.0"
        value={false}
        hasVoiceover={false}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByTestId("scene-native-audio-switch"));
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(true);
    });
  });

  // Task #137: Veo I2V audio capability
  describe("Veo I2V audio capability (Task #137)", () => {
    const veoVariants = [
      "veo",
      "veo-2",
      "veo-3",
      "veo-3.1",
      "veo2",
      "veo3",
      "veo3.1",
    ];

    for (const veo of veoVariants) {
      it(`is enabled for ${veo} when an image is attached`, () => {
        render(
          <NativeAudioToggle
            provider={veo}
            value={false}
            hasVoiceover={false}
            hasImage={true}
            onChange={vi.fn()}
          />,
        );
        expect(
          (screen.getByTestId("scene-native-audio-switch") as HTMLButtonElement)
            .disabled,
        ).toBe(false);
        expect(
          screen.queryByTestId("scene-native-audio-disabled-wrap"),
        ).toBeNull();
        cleanup();
      });

      it(`is disabled for ${veo} when no image is attached (Veo T2V has no audio)`, () => {
        render(
          <NativeAudioToggle
            provider={veo}
            value={false}
            hasVoiceover={false}
            hasImage={false}
            onChange={vi.fn()}
          />,
        );
        expect(
          (screen.getByTestId("scene-native-audio-switch") as HTMLButtonElement)
            .disabled,
        ).toBe(true);
        expect(
          screen.getByTestId("scene-native-audio-disabled-wrap"),
        ).toBeTruthy();
        cleanup();
      });
    }

    it("shows the conflict warning for Veo I2V too", () => {
      render(
        <NativeAudioToggle
          provider="veo-3.1"
          value={true}
          hasVoiceover={true}
          hasImage={true}
          onChange={vi.fn()}
        />,
      );
      expect(
        screen.queryByTestId("scene-native-audio-conflict"),
      ).toBeTruthy();
    });

    it("opens the mute-voiceover AlertDialog for Veo I2V too", async () => {
      const onMute = vi.fn().mockResolvedValue(undefined);
      render(
        <NativeAudioToggle
          provider="veo-3.1"
          value={true}
          hasVoiceover={true}
          hasImage={true}
          onChange={vi.fn()}
          onMuteVoiceover={onMute}
        />,
      );
      fireEvent.click(screen.getByTestId("scene-native-audio-mute-voiceover"));
      const action = await screen.findByTestId(
        "scene-native-audio-mute-confirm-action",
      );
      fireEvent.click(action);
      await waitFor(() => {
        expect(onMute).toHaveBeenCalledTimes(1);
      });
    });
  });
});
