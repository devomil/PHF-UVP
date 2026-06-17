import { describe, it, expect } from "vitest";
import {
  buildSuzzieSystemPrompt,
  buildAssetLibrarySuzziePrompt,
} from "../suzzie-knowledge-base";

describe("buildSuzzieSystemPrompt — @imageN guidance injection", () => {
  it("includes the @imageN block when provider is seedance-2.0 (multiImageSupport)", () => {
    const prompt = buildSuzzieSystemPrompt({ provider: "seedance-2.0" });
    expect(prompt).toContain("@imageN Syntax");
    expect(prompt).toContain("seedance-2.0");
    expect(prompt).toContain("@imageN");
  });

  it("omits the @imageN block when provider is runway (no multiImageSupport)", () => {
    const prompt = buildSuzzieSystemPrompt({ provider: "runway" });
    expect(prompt).not.toContain("@imageN Syntax");
    expect(prompt).not.toContain("Multi-Image References");
  });

  it("omits the @imageN block when no provider is supplied", () => {
    const prompt = buildSuzzieSystemPrompt({});
    expect(prompt).not.toContain("@imageN Syntax");
    expect(prompt).not.toContain("Multi-Image References");
  });

  it("surfaces the correct maxImages from the provider config", () => {
    const prompt = buildSuzzieSystemPrompt({ provider: "seedance-2.0" });
    expect(prompt).toMatch(/supports up to \d+ reference images/);
  });

  it("includes the provider name inside the @imageN guidance block", () => {
    const prompt = buildSuzzieSystemPrompt({ provider: "seedance-2.0" });
    const idx = prompt.indexOf("@imageN Syntax");
    expect(idx).toBeGreaterThanOrEqual(0);
    const block = prompt.slice(idx);
    expect(block).toContain("seedance-2.0");
  });

  it("includes the @imageN block when provider is seedance-2.0-fast (multiImageSupport)", () => {
    const prompt = buildSuzzieSystemPrompt({ provider: "seedance-2.0-fast" });
    expect(prompt).toContain("@imageN Syntax");
    expect(prompt).toContain("seedance-2.0-fast");
    expect(prompt).toContain("@imageN");
  });

  it("surfaces the correct maxImages from the provider config for seedance-2.0-fast", () => {
    const prompt = buildSuzzieSystemPrompt({ provider: "seedance-2.0-fast" });
    expect(prompt).toMatch(/supports up to \d+ reference images/);
  });

  it("includes the provider name inside the @imageN guidance block for seedance-2.0-fast", () => {
    const prompt = buildSuzzieSystemPrompt({ provider: "seedance-2.0-fast" });
    const idx = prompt.indexOf("@imageN Syntax");
    expect(idx).toBeGreaterThanOrEqual(0);
    const block = prompt.slice(idx);
    expect(block).toContain("seedance-2.0-fast");
  });

  it("still builds a non-empty prompt string when provider lacks multiImageSupport", () => {
    const prompt = buildSuzzieSystemPrompt({ provider: "runway-4.5" });
    expect(prompt.length).toBeGreaterThan(100);
    expect(prompt).toContain("Suzzie");
  });
});

describe("buildAssetLibrarySuzziePrompt — @imageN guidance injection", () => {
  it("includes the @imageN block when provider is seedance-2.0 (multiImageSupport)", () => {
    const prompt = buildAssetLibrarySuzziePrompt({
      mode: "i2v",
      provider: "seedance-2.0",
    });
    expect(prompt).toContain("@imageN Syntax");
    expect(prompt).toContain("seedance-2.0");
    expect(prompt).toContain("@imageN");
  });

  it("omits the @imageN block when provider is runway (no multiImageSupport)", () => {
    const prompt = buildAssetLibrarySuzziePrompt({
      mode: "t2v",
      provider: "runway",
    });
    expect(prompt).not.toContain("@imageN Syntax");
    expect(prompt).not.toContain("Multi-Image References");
  });

  it("omits the @imageN block when provider is 'auto'", () => {
    const prompt = buildAssetLibrarySuzziePrompt({
      mode: "i2v",
      provider: "auto",
    });
    expect(prompt).not.toContain("@imageN Syntax");
    expect(prompt).not.toContain("Multi-Image References");
  });

  it("omits the @imageN block when no provider is supplied", () => {
    const prompt = buildAssetLibrarySuzziePrompt({ mode: "t2i" });
    expect(prompt).not.toContain("@imageN Syntax");
    expect(prompt).not.toContain("Multi-Image References");
  });

  it("surfaces the correct maxImages from the provider config", () => {
    const prompt = buildAssetLibrarySuzziePrompt({
      mode: "i2v",
      provider: "seedance-2.0",
    });
    expect(prompt).toMatch(/supports up to \d+ reference images/);
  });

  it("includes example @imageN prompts in the guidance block", () => {
    const prompt = buildAssetLibrarySuzziePrompt({
      mode: "i2v",
      provider: "seedance-2.0",
    });
    expect(prompt).toContain("@image1");
    expect(prompt).toContain("@image2");
  });

  it("includes the @imageN block when provider is seedance-2.0-fast (multiImageSupport)", () => {
    const prompt = buildAssetLibrarySuzziePrompt({
      mode: "i2v",
      provider: "seedance-2.0-fast",
    });
    expect(prompt).toContain("@imageN Syntax");
    expect(prompt).toContain("seedance-2.0-fast");
    expect(prompt).toContain("@imageN");
  });

  it("surfaces the correct maxImages from the provider config for seedance-2.0-fast", () => {
    const prompt = buildAssetLibrarySuzziePrompt({
      mode: "i2v",
      provider: "seedance-2.0-fast",
    });
    expect(prompt).toMatch(/supports up to \d+ reference images/);
  });

  it("includes example @imageN prompts in the guidance block for seedance-2.0-fast", () => {
    const prompt = buildAssetLibrarySuzziePrompt({
      mode: "i2v",
      provider: "seedance-2.0-fast",
    });
    expect(prompt).toContain("@image1");
    expect(prompt).toContain("@image2");
  });

  it("still builds a non-empty prompt string when provider lacks multiImageSupport", () => {
    const prompt = buildAssetLibrarySuzziePrompt({
      mode: "t2v",
      provider: "runway-4.5",
    });
    expect(prompt.length).toBeGreaterThan(100);
    expect(prompt).toContain("Suzzie");
  });
});
