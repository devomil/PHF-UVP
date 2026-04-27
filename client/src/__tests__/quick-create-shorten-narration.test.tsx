// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// --- Stub heavy/unrelated child components so the panel mounts cheaply.
// We only care about the voiceover-duration warning and its action button.
vi.mock("@/components/video/provider-catalog-selector", () => ({
  ProviderCatalogSelector: () => null,
}));
vi.mock("@/components/video/scene-routing-ui", () => ({
  SlotTile: () => null,
}));
vi.mock("@/components/video/enhanced-scene-editor", () => ({
  EnhancedSceneEditor: () => null,
}));
vi.mock("@/components/video/scene-overlay-editor", () => ({
  SceneOverlayEditor: () => null,
}));
vi.mock("@/components/video/scene-image-actions", () => ({
  SceneImageActions: () => null,
}));
vi.mock("@/components/video/S3BackgroundPicker", () => ({
  S3BackgroundPicker: () => null,
}));
vi.mock("@/components/video/EndCardPreview", () => ({
  EndCardPreview: () => null,
}));
vi.mock("@/components/video/ask-suzzie-panel", () => ({
  AskSuzziePanel: () => null,
}));
vi.mock("@/components/canva/CanvaSyncCard", () => ({
  CanvaSyncCard: () => null,
}));
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children?: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  DialogContent: ({ children }: { children?: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: any) =>
    React.createElement("button", props, children),
}));

// Spy-able toast that survives across hook re-renders.
const toastMock = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock, toasts: [], dismiss: () => {} }),
}));

// Imported AFTER vi.mock calls (which are hoisted).
import { QuickCreateAssetPanel } from "@/pages/project-detail";

const PROJECT_ID = "test-project-1";
const ASSETS_KEY = ["quick-create-assets", PROJECT_ID];

function makeAssetsResponse() {
  // audioDur (12) > selectedDuration (6) so the "Shorten narration & re-record"
  // button is rendered (drift > tolerance and audioLonger=true).
  return {
    project: { id: PROJECT_ID, prompt: "Old script body", totalDuration: 6 },
    visual: { status: "completed", provider: "auto" },
    voiceover: {
      status: "completed",
      duration: 12,
      narrationText: "Old script body",
      tone: "punchy",
    },
    music: { status: "pending" },
    generationInfo: { aspectRatio: "16:9" },
    overlayItems: [],
  };
}

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  // Pre-seed the assets query so the panel skips the loading state and the
  // duration-mismatch warning (with our button) renders immediately.
  queryClient.setQueryData(ASSETS_KEY, makeAssetsResponse());
  const project = { id: PROJECT_ID, totalDuration: 6, mediaMode: "video" };
  return render(
    React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(QuickCreateAssetPanel, {
        projectId: PROJECT_ID,
        project,
      })
    )
  );
}

type FetchHandler = (url: string, init: RequestInit | undefined) => {
  status?: number;
  body?: unknown;
};

function installFetchMock(handler: FetchHandler) {
  const fetchMock = vi.fn(async (url: any, init?: RequestInit) => {
    const u = String(url);
    const result = handler(u, init);
    const status = result.status ?? 200;
    const body = result.body ?? {};
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    } as unknown as Response;
  });
  (global as any).fetch = fetchMock;
  return fetchMock;
}

describe("QuickCreateAssetPanel — Shorten narration & re-record", () => {
  beforeEach(() => {
    toastMock.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("chains suggest-narration (auto:true) → generate-voiceover with the freshly suggested script and shows a single combined success toast", async () => {
    const SUGGESTED = "Punchy shortened script that fits in six seconds.";
    const fetchMock = installFetchMock((url) => {
      if (url.endsWith("/quick-create/suggest-narration")) {
        return {
          status: 200,
          body: { script: SUGGESTED, wordCount: 9, targetWords: 14 },
        };
      }
      if (url.endsWith("/quick-create/generate-voiceover")) {
        return { status: 202, body: { jobId: "vo-1" } };
      }
      // Background polling / overlays etc — return harmless empty data.
      return { status: 200, body: {} };
    });

    renderPanel();

    const button = await screen.findByTestId("shorten-narration-to-fit");
    fireEvent.click(button);

    // Both endpoints must be called, in order.
    await waitFor(() => {
      const calls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(
        calls.some((u) => u.endsWith("/quick-create/suggest-narration"))
      ).toBe(true);
      expect(
        calls.some((u) => u.endsWith("/quick-create/generate-voiceover"))
      ).toBe(true);
    });

    const calls = fetchMock.mock.calls.map(([url, init]) => ({
      url: String(url),
      init: init as RequestInit | undefined,
    }));
    const suggestCall = calls.find((c) =>
      c.url.endsWith("/quick-create/suggest-narration")
    )!;
    const voiceoverCall = calls.find((c) =>
      c.url.endsWith("/quick-create/generate-voiceover")
    )!;

    // Suggest endpoint receives the current video duration as the target so
    // the LLM produces a script that fits. (The `auto` flag is intentionally
    // a client-side variable on the mutation — it suppresses the per-step
    // "Narration suggested" toast so the combined toast below isn't doubled
    // up — and is not sent over the wire. We assert that suppression below.)
    const suggestBody = JSON.parse(String(suggestCall.init?.body));
    expect(suggestBody).toMatchObject({
      durationSec: 6,
      tone: "punchy",
    });

    // Voiceover endpoint receives the freshly suggested script — NOT the stale
    // local narrationText state. This is the critical chained-flow guarantee.
    const voiceoverBody = JSON.parse(String(voiceoverCall.init?.body));
    expect(voiceoverBody.narrationText).toBe(SUGGESTED);

    // Suggest must run before voiceover.
    const suggestIdx = calls.findIndex((c) =>
      c.url.endsWith("/quick-create/suggest-narration")
    );
    const voiceoverIdx = calls.findIndex((c) =>
      c.url.endsWith("/quick-create/generate-voiceover")
    );
    expect(suggestIdx).toBeLessThan(voiceoverIdx);

    // Combined toast on success — and no per-step "Narration suggested" /
    // "Voiceover Generation Started" toasts (they're suppressed via auto/silentToast).
    await waitFor(() => {
      const titles = toastMock.mock.calls.map(([arg]) => arg?.title);
      expect(titles).toContain("Narration shortened, voiceover re-recording");
    });
    const titles = toastMock.mock.calls.map(([arg]) => arg?.title);
    expect(titles).not.toContain("Narration suggested");
    expect(titles).not.toContain("Voiceover Generation Started");
    expect(titles).not.toContain("Voiceover regeneration failed");
  });

  it("shows the recovery toast when generate-voiceover fails after a successful shorten", async () => {
    const SUGGESTED = "Even shorter script.";
    const fetchMock = installFetchMock((url) => {
      if (url.endsWith("/quick-create/suggest-narration")) {
        return {
          status: 200,
          body: { script: SUGGESTED, wordCount: 4, targetWords: 14 },
        };
      }
      if (url.endsWith("/quick-create/generate-voiceover")) {
        return { status: 500, body: { error: "boom" } };
      }
      return { status: 200, body: {} };
    });

    renderPanel();

    const button = await screen.findByTestId("shorten-narration-to-fit");
    fireEvent.click(button);

    await waitFor(() => {
      const calls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(
        calls.some((u) => u.endsWith("/quick-create/generate-voiceover"))
      ).toBe(true);
    });

    // The recovery toast must surface and the success toast must NOT fire.
    await waitFor(() => {
      const titles = toastMock.mock.calls.map(([arg]) => arg?.title);
      expect(titles).toContain("Voiceover regeneration failed");
    });
    const recoveryToast = toastMock.mock.calls
      .map(([arg]) => arg)
      .find((arg: any) => arg?.title === "Voiceover regeneration failed");
    // The recovery copy must clearly tell the user the script DID get shortened
    // (so they don't retry the whole flow) and how to recover (Regenerate
    // Voiceover). This wording is what lets users move forward without losing
    // the successful first half of the chain.
    expect(recoveryToast?.description).toMatch(/script was shortened/i);
    expect(recoveryToast?.description).toMatch(/Regenerate Voiceover/i);
    expect(recoveryToast?.variant).toBe("destructive");
    const titles = toastMock.mock.calls.map(([arg]) => arg?.title);
    expect(titles).not.toContain("Narration shortened, voiceover re-recording");
    // The generic per-mutation error toast is suppressed (silentToast) so we
    // don't double up on destructive toasts.
    expect(titles).not.toContain("Error");
  });
});
