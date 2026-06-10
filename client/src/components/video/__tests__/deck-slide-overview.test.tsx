// @vitest-environment jsdom
//
// Task #195: DeckSlideOverview derives slide coverage from each scene's
// brandReferences[].assetUrl matched against progress.deckImages — no new
// persistence. These tests guard the derivation (unused / on scene N / reused),
// the legacy url/imageUrl fallbacks, and the click-to-jump targeting.

import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

import { DeckSlideOverview } from "../deck-slide-overview";

afterEach(cleanup);

const deckImages = [
  { id: "img-a", url: "https://cdn/a.png", pageNumber: 1, label: "Intro" },
  { id: "img-b", url: "https://cdn/b.png", pageNumber: 2 },
  { id: "img-c", url: "https://cdn/c.png", pageNumber: 3 },
];

describe("DeckSlideOverview", () => {
  it("renders nothing when there are no deck images", () => {
    const { container } = render(
      <DeckSlideOverview deckImages={[]} scenes={[]} onOpenScene={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("labels unused, single-use, and reused slides", () => {
    const scenes = [
      { id: "s1", brandReferences: [{ assetUrl: "https://cdn/a.png" }] },
      { id: "s2", brandReferences: [{ assetUrl: "https://cdn/a.png" }] }, // reuses A
      { id: "s3", brandReferences: [{ assetUrl: "https://cdn/b.png" }] },
      // C is unused
    ];
    render(<DeckSlideOverview deckImages={deckImages} scenes={scenes} onOpenScene={vi.fn()} />);

    expect(screen.getByTestId("deck-overview-badge-img-a").textContent).toContain("On 2 scenes");
    expect(screen.getByTestId("deck-overview-badge-img-b").textContent).toContain("On scene 3");
    expect(screen.getByTestId("deck-overview-badge-img-c").textContent).toContain("Unused");

    expect(screen.getByTestId("deck-overview-summary").textContent).toContain("2/3 placed");
    expect(screen.getByTestId("deck-overview-unused-count").textContent).toContain("1 unused");
    expect(screen.getByTestId("deck-overview-reused-count").textContent).toContain("1 reused");
  });

  it("matches via legacy url/imageUrl ref fields too", () => {
    const scenes = [
      { id: "s1", brandReferences: [{ url: "https://cdn/a.png" }] },
      { id: "s2", brandReferences: [{ imageUrl: "https://cdn/b.png" }] },
    ];
    render(<DeckSlideOverview deckImages={deckImages} scenes={scenes} onOpenScene={vi.fn()} />);
    expect(screen.getByTestId("deck-overview-badge-img-a").textContent).toContain("On scene 1");
    expect(screen.getByTestId("deck-overview-badge-img-b").textContent).toContain("On scene 2");
  });

  it("jumps to the using scene for a placed slide", () => {
    const onOpenScene = vi.fn();
    const scenes = [
      { id: "s1", brandReferences: [] },
      { id: "s2", brandReferences: [{ assetUrl: "https://cdn/b.png" }] },
    ];
    render(<DeckSlideOverview deckImages={deckImages} scenes={scenes} onOpenScene={onOpenScene} />);
    fireEvent.click(screen.getByTestId("deck-overview-slide-img-b"));
    expect(onOpenScene).toHaveBeenCalledWith("s2");
  });

  it("jumps to the first scene for an unused slide so the user can place it", () => {
    const onOpenScene = vi.fn();
    const scenes = [
      { id: "s1", brandReferences: [] },
      { id: "s2", brandReferences: [] },
    ];
    render(<DeckSlideOverview deckImages={deckImages} scenes={scenes} onOpenScene={onOpenScene} />);
    fireEvent.click(screen.getByTestId("deck-overview-slide-img-c"));
    expect(onOpenScene).toHaveBeenCalledWith("s1");
  });

  it("falls back to scene-<index> ids when a scene has no id", () => {
    const onOpenScene = vi.fn();
    const scenes = [{ brandReferences: [{ assetUrl: "https://cdn/a.png" }] }];
    render(<DeckSlideOverview deckImages={deckImages} scenes={scenes} onOpenScene={onOpenScene} />);
    fireEvent.click(screen.getByTestId("deck-overview-slide-img-a"));
    expect(onOpenScene).toHaveBeenCalledWith("scene-0");
  });
});
