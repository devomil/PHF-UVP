import { describe, it, expect } from "vitest";
import {
  parseSuzzieSceneEditorResponse,
  parseSuzzieAssetLibraryResponse,
} from "../suzzie-json-parser";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function wrap(json: Record<string, unknown>): string {
  return "```json\n" + JSON.stringify(json) + "\n```";
}

// ---------------------------------------------------------------------------
// parseSuzzieSceneEditorResponse
// ---------------------------------------------------------------------------

describe("parseSuzzieSceneEditorResponse — suggestedProviderRationale extraction", () => {
  it("extracts suggestedProviderRationale from a JSON block", () => {
    const text = wrap({
      suggestedProvider: "runway",
      suggestedProviderRationale: "Runway excels at cinematic motion.",
      suggestedPrompt: "A sunrise over mountains",
    });
    const result = parseSuzzieSceneEditorResponse(text);
    expect(result.suggestedProviderRationale).toBe("Runway excels at cinematic motion.");
  });

  it("extracts suggestedProvider alongside suggestedProviderRationale", () => {
    const text = wrap({
      suggestedProvider: "kling",
      suggestedProviderRationale: "Kling handles fast motion best.",
    });
    const result = parseSuzzieSceneEditorResponse(text);
    expect(result.suggestedProvider).toBe("kling");
    expect(result.suggestedProviderRationale).toBe("Kling handles fast motion best.");
  });

  it("extracts suggestedPrompt from a JSON block", () => {
    const text = wrap({ suggestedPrompt: "A cinematic shot of a city at night" });
    const result = parseSuzzieSceneEditorResponse(text);
    expect(result.suggestedPrompt).toBe("A cinematic shot of a city at night");
  });

  it("extracts suggestedArtStyle from a JSON block", () => {
    const text = wrap({
      suggestedArtStyle: { id: "cinematic-realism", name: "Cinematic Realism" },
    });
    const result = parseSuzzieSceneEditorResponse(text);
    expect(result.suggestedArtStyle).toEqual({ id: "cinematic-realism", name: "Cinematic Realism" });
  });

  it("omits suggestedProviderRationale (undefined, not null) when absent from the JSON block", () => {
    const text = wrap({ suggestedProvider: "runway", suggestedPrompt: "Some prompt" });
    const result = parseSuzzieSceneEditorResponse(text);
    expect(result.suggestedProviderRationale).toBeUndefined();
    expect(result.suggestedProviderRationale).not.toBeNull();
  });

  it("omits suggestedProvider when absent from the JSON block", () => {
    const text = wrap({ suggestedPrompt: "Some prompt" });
    const result = parseSuzzieSceneEditorResponse(text);
    expect(result.suggestedProvider).toBeUndefined();
  });

  it("omits suggestedArtStyle when absent from the JSON block", () => {
    const text = wrap({ suggestedProvider: "runway" });
    const result = parseSuzzieSceneEditorResponse(text);
    expect(result.suggestedArtStyle).toBeUndefined();
  });

  it("omits suggestedArtStyle when the block has no id/name fields", () => {
    const text = wrap({ suggestedArtStyle: { label: "bad shape" } });
    const result = parseSuzzieSceneEditorResponse(text);
    expect(result.suggestedArtStyle).toBeUndefined();
  });

  it("returns all undefined fields and empty cleanMessage when text has no JSON blocks", () => {
    const text = "Sure, here is my recommendation — use Runway for smooth motion.";
    const result = parseSuzzieSceneEditorResponse(text);
    expect(result.suggestedPrompt).toBeUndefined();
    expect(result.suggestedProvider).toBeUndefined();
    expect(result.suggestedProviderRationale).toBeUndefined();
    expect(result.suggestedArtStyle).toBeUndefined();
    expect(result.cleanMessage).toBe(text);
  });

  it("strips the JSON block from cleanMessage and keeps surrounding prose", () => {
    const prose = "Here is my suggestion:";
    const trailing = "Let me know if you need anything else.";
    const text = `${prose}\n${wrap({ suggestedProvider: "runway" })}\n${trailing}`;
    const result = parseSuzzieSceneEditorResponse(text);
    expect(result.cleanMessage).not.toContain("```json");
    expect(result.cleanMessage).toContain(prose);
    expect(result.cleanMessage).toContain(trailing);
  });

  it("takes the first JSON block's value when multiple blocks are present", () => {
    const first = wrap({ suggestedProviderRationale: "First rationale", suggestedProvider: "runway" });
    const second = wrap({ suggestedProviderRationale: "Second rationale", suggestedProvider: "kling" });
    const result = parseSuzzieSceneEditorResponse(`${first}\n${second}`);
    expect(result.suggestedProviderRationale).toBe("First rationale");
    expect(result.suggestedProvider).toBe("runway");
  });

  it("silently skips malformed JSON blocks and still extracts from valid ones", () => {
    const text = "```json\n{ invalid json }\n```\n" + wrap({ suggestedProviderRationale: "Valid rationale" });
    const result = parseSuzzieSceneEditorResponse(text);
    expect(result.suggestedProviderRationale).toBe("Valid rationale");
  });

  it("returns an empty string cleanMessage when text contains only a JSON block", () => {
    const text = wrap({ suggestedProvider: "runway" });
    const result = parseSuzzieSceneEditorResponse(text);
    expect(result.cleanMessage).toBe("");
  });
});

// ---------------------------------------------------------------------------
// parseSuzzieAssetLibraryResponse
// ---------------------------------------------------------------------------

describe("parseSuzzieAssetLibraryResponse — suggestedProviderRationale extraction", () => {
  it("extracts suggestedProviderRationale from a JSON block", () => {
    const text = wrap({
      suggestedProvider: "kling",
      suggestedProviderRationale: "Kling is ideal for product close-ups.",
      suggestedPrompt: "A rotating bottle on a marble surface",
    });
    const result = parseSuzzieAssetLibraryResponse(text);
    expect(result.suggestedProviderRationale).toBe("Kling is ideal for product close-ups.");
  });

  it("extracts suggestedProvider alongside suggestedProviderRationale", () => {
    const text = wrap({
      suggestedProvider: "luma",
      suggestedProviderRationale: "Luma renders fluid dynamics well.",
    });
    const result = parseSuzzieAssetLibraryResponse(text);
    expect(result.suggestedProvider).toBe("luma");
    expect(result.suggestedProviderRationale).toBe("Luma renders fluid dynamics well.");
  });

  it("extracts suggestedNegativePrompt from a JSON block", () => {
    const text = wrap({ suggestedNegativePrompt: "blurry, low quality" });
    const result = parseSuzzieAssetLibraryResponse(text);
    expect(result.suggestedNegativePrompt).toBe("blurry, low quality");
  });

  it("extracts suggestedCfgScale from a JSON block within the valid 0–1 range", () => {
    const text = wrap({ suggestedCfgScale: 0.75 });
    const result = parseSuzzieAssetLibraryResponse(text);
    expect(result.suggestedCfgScale).toBe(0.75);
  });

  it("rejects suggestedCfgScale values outside the 0–1 range", () => {
    const text = wrap({ suggestedCfgScale: 1.5 });
    const result = parseSuzzieAssetLibraryResponse(text);
    expect(result.suggestedCfgScale).toBeUndefined();
  });

  it("accepts suggestedCfgScale at the boundary values 0 and 1", () => {
    const textZero = wrap({ suggestedCfgScale: 0 });
    const textOne = wrap({ suggestedCfgScale: 1 });
    expect(parseSuzzieAssetLibraryResponse(textZero).suggestedCfgScale).toBe(0);
    expect(parseSuzzieAssetLibraryResponse(textOne).suggestedCfgScale).toBe(1);
  });

  it("accepts suggestedCfgScale provided as a numeric string", () => {
    const text = wrap({ suggestedCfgScale: "0.85" });
    const result = parseSuzzieAssetLibraryResponse(text);
    expect(result.suggestedCfgScale).toBe(0.85);
  });

  it("omits suggestedProviderRationale (undefined, not null) when absent from the JSON block", () => {
    const text = wrap({ suggestedProvider: "luma", suggestedPrompt: "Some prompt" });
    const result = parseSuzzieAssetLibraryResponse(text);
    expect(result.suggestedProviderRationale).toBeUndefined();
    expect(result.suggestedProviderRationale).not.toBeNull();
  });

  it("omits suggestedProvider when absent from the JSON block", () => {
    const text = wrap({ suggestedPrompt: "Some prompt" });
    const result = parseSuzzieAssetLibraryResponse(text);
    expect(result.suggestedProvider).toBeUndefined();
  });

  it("omits suggestedNegativePrompt when absent from the JSON block", () => {
    const text = wrap({ suggestedProvider: "runway" });
    const result = parseSuzzieAssetLibraryResponse(text);
    expect(result.suggestedNegativePrompt).toBeUndefined();
  });

  it("omits suggestedCfgScale when absent from the JSON block", () => {
    const text = wrap({ suggestedProvider: "runway" });
    const result = parseSuzzieAssetLibraryResponse(text);
    expect(result.suggestedCfgScale).toBeUndefined();
  });

  it("returns all undefined fields and full text as cleanMessage when no JSON blocks present", () => {
    const text = "Try using Luma for this shot — it handles liquid beautifully.";
    const result = parseSuzzieAssetLibraryResponse(text);
    expect(result.suggestedPrompt).toBeUndefined();
    expect(result.suggestedProvider).toBeUndefined();
    expect(result.suggestedProviderRationale).toBeUndefined();
    expect(result.suggestedNegativePrompt).toBeUndefined();
    expect(result.suggestedCfgScale).toBeUndefined();
    expect(result.cleanMessage).toBe(text);
  });

  it("strips the JSON block from cleanMessage", () => {
    const prose = "Here is my suggestion for the asset library:";
    const trailing = "Feel free to ask follow-up questions.";
    const text = `${prose}\n${wrap({ suggestedProvider: "kling" })}\n${trailing}`;
    const result = parseSuzzieAssetLibraryResponse(text);
    expect(result.cleanMessage).not.toContain("```json");
    expect(result.cleanMessage).toContain(prose);
    expect(result.cleanMessage).toContain(trailing);
  });

  it("takes the first JSON block's value when multiple blocks are present", () => {
    const first = wrap({ suggestedProviderRationale: "First asset lib rationale", suggestedProvider: "luma" });
    const second = wrap({ suggestedProviderRationale: "Second rationale", suggestedProvider: "kling" });
    const result = parseSuzzieAssetLibraryResponse(`${first}\n${second}`);
    expect(result.suggestedProviderRationale).toBe("First asset lib rationale");
    expect(result.suggestedProvider).toBe("luma");
  });

  it("silently skips malformed JSON blocks and still extracts from valid ones", () => {
    const text = "```json\n{ bad }\n```\n" + wrap({ suggestedProviderRationale: "Recovered rationale" });
    const result = parseSuzzieAssetLibraryResponse(text);
    expect(result.suggestedProviderRationale).toBe("Recovered rationale");
  });
});
