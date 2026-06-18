import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  buildSuzzieSystemPrompt,
  buildAssetLibrarySuzziePrompt,
} from "../suzzie-knowledge-base";
import { VIDEO_PROVIDERS, IMAGE_PROVIDERS, SOUND_PROVIDERS } from "../../../shared/provider-config";

const videoMultiImageProviders = Object.values(VIDEO_PROVIDERS).filter(
  (p) => p.multiImageSupport != null,
);

const imageMultiImageProviders = Object.values(IMAGE_PROVIDERS).filter(
  (p) => p.multiImageSupport != null,
);

const soundMultiImageProviders = Object.values(SOUND_PROVIDERS).filter(
  (p) => p.multiImageSupport != null,
);

const soundVoiceCloneProviders = Object.values(SOUND_PROVIDERS).filter(
  (p) => p.voiceCloneSupport != null,
);

const soundReferenceAudioProviders = Object.values(SOUND_PROVIDERS).filter(
  (p) => p.referenceAudioSupport != null,
);

const videoCfgControlProviders = Object.values(VIDEO_PROVIDERS).filter(
  (p) => p.cfgControlSupport != null,
);

const imageCfgControlProviders = Object.values(IMAGE_PROVIDERS).filter(
  (p) => p.cfgControlSupport != null,
);

const videoIpAdapterProviders = Object.values(VIDEO_PROVIDERS).filter(
  (p) => p.ipAdapterSupport != null,
);

const imageIpAdapterProviders = Object.values(IMAGE_PROVIDERS).filter(
  (p) => p.ipAdapterSupport != null,
);

describe("buildSuzzieSystemPrompt — @imageN guidance injection", () => {
  it.each(videoMultiImageProviders)(
    "includes the @imageN block for video provider $id (multiImageSupport)",
    ({ id }) => {
      const prompt = buildSuzzieSystemPrompt({ provider: id });
      expect(prompt).toContain("@imageN Syntax");
      expect(prompt).toContain(id);
      expect(prompt).toContain("@imageN");
      expect(prompt).toMatch(/supports up to \d+ reference images/);
      const idx = prompt.indexOf("@imageN Syntax");
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(prompt.slice(idx)).toContain(id);
    },
  );

  it.each(imageMultiImageProviders)(
    "includes the @imageN block for image provider $id (multiImageSupport)",
    ({ id }) => {
      const prompt = buildSuzzieSystemPrompt({ provider: id });
      expect(prompt).toContain("@imageN Syntax");
      expect(prompt).toContain(id);
      expect(prompt).toContain("@imageN");
      expect(prompt).toMatch(/supports up to \d+ reference images/);
      const idx = prompt.indexOf("@imageN Syntax");
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(prompt.slice(idx)).toContain(id);
    },
  );

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

  it("still builds a non-empty prompt string when provider lacks multiImageSupport", () => {
    const prompt = buildSuzzieSystemPrompt({ provider: "runway-4.5" });
    expect(prompt.length).toBeGreaterThan(100);
    expect(prompt).toContain("Suzzie");
  });
});

describe("buildAssetLibrarySuzziePrompt — @imageN guidance injection", () => {
  it.each(videoMultiImageProviders)(
    "includes the @imageN block for video provider $id (multiImageSupport)",
    ({ id }) => {
      const prompt = buildAssetLibrarySuzziePrompt({ mode: "i2v", provider: id });
      expect(prompt).toContain("@imageN Syntax");
      expect(prompt).toContain(id);
      expect(prompt).toContain("@imageN");
      expect(prompt).toMatch(/supports up to \d+ reference images/);
      expect(prompt).toContain("@image1");
      expect(prompt).toContain("@image2");
    },
  );

  it.each(imageMultiImageProviders)(
    "includes the @imageN block for image provider $id (multiImageSupport)",
    ({ id }) => {
      const prompt = buildAssetLibrarySuzziePrompt({ mode: "t2i", provider: id });
      expect(prompt).toContain("@imageN Syntax");
      expect(prompt).toContain(id);
      expect(prompt).toContain("@imageN");
      expect(prompt).toMatch(/supports up to \d+ reference images/);
      expect(prompt).toContain("@image1");
      expect(prompt).toContain("@image2");
    },
  );

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

  it("still builds a non-empty prompt string when provider lacks multiImageSupport", () => {
    const prompt = buildAssetLibrarySuzziePrompt({
      mode: "t2v",
      provider: "runway-4.5",
    });
    expect(prompt.length).toBeGreaterThan(100);
    expect(prompt).toContain("Suzzie");
  });
});

describe("buildSuzzieSystemPrompt — @imageN guidance injection for sound providers", () => {
  it.each(soundMultiImageProviders)(
    "includes the @imageN block for sound provider $id (multiImageSupport)",
    ({ id }) => {
      const prompt = buildSuzzieSystemPrompt({ provider: id });
      expect(prompt).toContain("@imageN Syntax");
      expect(prompt).toContain(id);
      expect(prompt).toContain("@imageN");
      expect(prompt).toMatch(/supports up to \d+ reference images/);
      const idx = prompt.indexOf("@imageN Syntax");
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(prompt.slice(idx)).toContain(id);
    },
  );

  it("still builds a non-empty prompt string for elevenlabs (no multiImageSupport)", () => {
    const prompt = buildSuzzieSystemPrompt({ provider: "elevenlabs" });
    expect(prompt.length).toBeGreaterThan(100);
    expect(prompt).toContain("Suzzie");
  });
});

describe("buildAssetLibrarySuzziePrompt — @imageN guidance injection for sound providers", () => {
  it.each(soundMultiImageProviders)(
    "includes the @imageN block for sound provider $id (multiImageSupport)",
    ({ id }) => {
      const prompt = buildAssetLibrarySuzziePrompt({ mode: "t2v", provider: id });
      expect(prompt).toContain("@imageN Syntax");
      expect(prompt).toContain(id);
      expect(prompt).toContain("@imageN");
      expect(prompt).toMatch(/supports up to \d+ reference images/);
      expect(prompt).toContain("@image1");
      expect(prompt).toContain("@image2");
    },
  );

  it("still builds a non-empty prompt string for elevenlabs (no multiImageSupport)", () => {
    const prompt = buildAssetLibrarySuzziePrompt({
      mode: "t2v",
      provider: "elevenlabs",
    });
    expect(prompt.length).toBeGreaterThan(100);
    expect(prompt).toContain("Suzzie");
  });
});

describe("buildSuzzieSystemPrompt — voice clone guidance injection for sound providers", () => {
  it.each(soundVoiceCloneProviders)(
    "includes the Voice Clone block for sound provider $id (voiceCloneSupport)",
    ({ id, voiceCloneSupport }) => {
      const prompt = buildSuzzieSystemPrompt({ provider: id });
      expect(prompt).toContain("Voice Clone Syntax");
      expect(prompt).toContain("Voice Cloning");
      expect(prompt).toContain(id);
      expect(prompt).toMatch(/supports voice cloning with up to \d+ voice/);
      const idx = prompt.indexOf("Voice Clone Syntax");
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(prompt.slice(idx)).toContain(id);
    },
  );

  it("omits the Voice Clone block when provider is elevenlabs (no voiceCloneSupport)", () => {
    const prompt = buildSuzzieSystemPrompt({ provider: "elevenlabs" });
    expect(prompt).not.toContain("Voice Clone Syntax");
  });

  it("still builds a non-empty prompt string for elevenlabs (no voiceCloneSupport)", () => {
    const prompt = buildSuzzieSystemPrompt({ provider: "elevenlabs" });
    expect(prompt.length).toBeGreaterThan(100);
    expect(prompt).toContain("Suzzie");
  });
});

describe("buildAssetLibrarySuzziePrompt — voice clone guidance injection for sound providers", () => {
  it.each(soundVoiceCloneProviders)(
    "includes the Voice Clone block for sound provider $id (voiceCloneSupport)",
    ({ id }) => {
      const prompt = buildAssetLibrarySuzziePrompt({ mode: "t2v", provider: id });
      expect(prompt).toContain("Voice Clone Syntax");
      expect(prompt).toContain("Voice Cloning");
      expect(prompt).toContain(id);
      expect(prompt).toMatch(/supports voice cloning with up to \d+ voice/);
    },
  );

  it("still builds a non-empty prompt string for elevenlabs (no voiceCloneSupport)", () => {
    const prompt = buildAssetLibrarySuzziePrompt({
      mode: "t2v",
      provider: "elevenlabs",
    });
    expect(prompt.length).toBeGreaterThan(100);
    expect(prompt).toContain("Suzzie");
  });
});

describe("buildSuzzieSystemPrompt — reference audio guidance injection for sound providers", () => {
  it.each(soundReferenceAudioProviders)(
    "includes the Reference Audio block for sound provider $id (referenceAudioSupport)",
    ({ id }) => {
      const prompt = buildSuzzieSystemPrompt({ provider: id });
      expect(prompt).toContain("Reference Audio Syntax");
      expect(prompt).toContain("Style Matching");
      expect(prompt).toContain(id);
      expect(prompt).toContain("reference audio");
      const idx = prompt.indexOf("Reference Audio Syntax");
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(prompt.slice(idx)).toContain(id);
    },
  );

  it("omits the Reference Audio block when provider is elevenlabs (no referenceAudioSupport)", () => {
    const prompt = buildSuzzieSystemPrompt({ provider: "elevenlabs" });
    expect(prompt).not.toContain("Reference Audio Syntax");
  });

  it("still builds a non-empty prompt string for elevenlabs (no referenceAudioSupport)", () => {
    const prompt = buildSuzzieSystemPrompt({ provider: "elevenlabs" });
    expect(prompt.length).toBeGreaterThan(100);
    expect(prompt).toContain("Suzzie");
  });
});

describe("buildAssetLibrarySuzziePrompt — reference audio guidance injection for sound providers", () => {
  it.each(soundReferenceAudioProviders)(
    "includes the Reference Audio block for sound provider $id (referenceAudioSupport)",
    ({ id }) => {
      const prompt = buildAssetLibrarySuzziePrompt({ mode: "t2v", provider: id });
      expect(prompt).toContain("Reference Audio Syntax");
      expect(prompt).toContain("Style Matching");
      expect(prompt).toContain(id);
      expect(prompt).toContain("reference audio");
    },
  );

  it("still builds a non-empty prompt string for elevenlabs (no referenceAudioSupport)", () => {
    const prompt = buildAssetLibrarySuzziePrompt({
      mode: "t2v",
      provider: "elevenlabs",
    });
    expect(prompt.length).toBeGreaterThan(100);
    expect(prompt).toContain("Suzzie");
  });
});

describe("buildSuzzieSystemPrompt — CFG scale guidance injection for video providers", () => {
  it.each(videoCfgControlProviders)(
    "includes the CFG Scale Control block for video provider $id (cfgControlSupport)",
    ({ id, cfgControlSupport }) => {
      const prompt = buildSuzzieSystemPrompt({ provider: id });
      expect(prompt).toContain("CFG Scale Control");
      expect(prompt).toContain("Source Frame Fidelity");
      expect(prompt).toContain(id);
      expect(prompt).toContain("cfg_scale");
      expect(prompt).toMatch(/cfg_scale tuning in the range \d+(\.\d+)?/);
      const idx = prompt.indexOf("CFG Scale Control");
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(prompt.slice(idx)).toContain(id);
    },
  );

  it.each(imageCfgControlProviders)(
    "includes the CFG Scale Control block for image provider $id (cfgControlSupport)",
    ({ id }) => {
      const prompt = buildSuzzieSystemPrompt({ provider: id });
      expect(prompt).toContain("CFG Scale Control");
      expect(prompt).toContain("Source Frame Fidelity");
      expect(prompt).toContain(id);
      expect(prompt).toContain("cfg_scale");
      const idx = prompt.indexOf("CFG Scale Control");
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(prompt.slice(idx)).toContain(id);
    },
  );

  it("omits the CFG Scale Control block when provider is runway (no cfgControlSupport)", () => {
    const prompt = buildSuzzieSystemPrompt({ provider: "runway" });
    expect(prompt).not.toContain("CFG Scale Control");
  });

  it("omits the CFG Scale Control block when no provider is supplied", () => {
    const prompt = buildSuzzieSystemPrompt({});
    expect(prompt).not.toContain("CFG Scale Control");
  });
});

describe("buildAssetLibrarySuzziePrompt — CFG scale guidance injection for video providers", () => {
  it.each(videoCfgControlProviders)(
    "includes the CFG Scale Control block for video provider $id (cfgControlSupport)",
    ({ id }) => {
      const prompt = buildAssetLibrarySuzziePrompt({ mode: "i2v", provider: id });
      expect(prompt).toContain("CFG Scale Control");
      expect(prompt).toContain("Source Frame Fidelity");
      expect(prompt).toContain(id);
      expect(prompt).toContain("cfg_scale");
      expect(prompt).toMatch(/cfg_scale tuning in the range \d+(\.\d+)?/);
    },
  );

  it.each(imageCfgControlProviders)(
    "includes the CFG Scale Control block for image provider $id (cfgControlSupport)",
    ({ id }) => {
      const prompt = buildAssetLibrarySuzziePrompt({ mode: "t2i", provider: id });
      expect(prompt).toContain("CFG Scale Control");
      expect(prompt).toContain("Source Frame Fidelity");
      expect(prompt).toContain(id);
      expect(prompt).toContain("cfg_scale");
    },
  );

  it("omits the CFG Scale Control block when provider is runway (no cfgControlSupport)", () => {
    const prompt = buildAssetLibrarySuzziePrompt({ mode: "t2v", provider: "runway" });
    expect(prompt).not.toContain("CFG Scale Control");
  });

  it("omits the CFG Scale Control block when no provider is supplied", () => {
    const prompt = buildAssetLibrarySuzziePrompt({ mode: "t2i" });
    expect(prompt).not.toContain("CFG Scale Control");
  });
});

describe("buildSuzzieSystemPrompt — CFG scale decision-tree instruction text", () => {
  it.each(videoCfgControlProviders)(
    "includes the product/label decision-tree branch for video provider $id",
    ({ id }) => {
      const prompt = buildSuzzieSystemPrompt({ provider: id });
      expect(prompt).toContain("suggestedCfgScale");
      expect(prompt).toContain("0.85–0.95");
      expect(prompt).toContain("Product with a visible label");
    },
  );

  it.each(imageCfgControlProviders)(
    "includes the product/label decision-tree branch for image provider $id",
    ({ id }) => {
      const prompt = buildSuzzieSystemPrompt({ provider: id });
      expect(prompt).toContain("suggestedCfgScale");
      expect(prompt).toContain("0.85–0.95");
      expect(prompt).toContain("Product with a visible label");
    },
  );

  it.each(videoCfgControlProviders)(
    "includes the character identity-lock decision-tree branch for video provider $id",
    ({ id }) => {
      const prompt = buildSuzzieSystemPrompt({ provider: id });
      expect(prompt).toContain("0.6–0.75");
      expect(prompt).toContain("Character whose face or costume identity must stay locked");
    },
  );

  it.each(videoCfgControlProviders)(
    "includes the proactive suggestion sentence for video provider $id",
    ({ id }) => {
      const prompt = buildSuzzieSystemPrompt({ provider: id });
      expect(prompt).toContain("Proactively suggest a");
      expect(prompt).toContain("how do I stop the label from warping");
    },
  );

  it.each(videoCfgControlProviders)(
    "includes suggestedCfgScale in the response-format section for video provider $id",
    ({ id }) => {
      const prompt = buildSuzzieSystemPrompt({ provider: id });
      const formatIdx = prompt.indexOf("## Response Format");
      expect(formatIdx).toBeGreaterThanOrEqual(0);
      const formatSection = prompt.slice(formatIdx);
      expect(formatSection).toContain("suggestedCfgScale");
      expect(formatSection).toContain("product/label/text scenes");
      expect(formatSection).toContain("character identity-lock scenes");
    },
  );
});

describe("buildAssetLibrarySuzziePrompt — CFG scale decision-tree instruction text", () => {
  it.each(videoCfgControlProviders)(
    "includes the product/label decision-tree branch for video provider $id",
    ({ id }) => {
      const prompt = buildAssetLibrarySuzziePrompt({ mode: "i2v", provider: id });
      expect(prompt).toContain("suggestedCfgScale");
      expect(prompt).toContain("0.85–0.95");
      expect(prompt).toContain("Product with a visible label");
    },
  );

  it.each(imageCfgControlProviders)(
    "includes the product/label decision-tree branch for image provider $id",
    ({ id }) => {
      const prompt = buildAssetLibrarySuzziePrompt({ mode: "t2i", provider: id });
      expect(prompt).toContain("suggestedCfgScale");
      expect(prompt).toContain("0.85–0.95");
      expect(prompt).toContain("Product with a visible label");
    },
  );

  it.each(videoCfgControlProviders)(
    "includes the character identity-lock decision-tree branch for video provider $id",
    ({ id }) => {
      const prompt = buildAssetLibrarySuzziePrompt({ mode: "i2v", provider: id });
      expect(prompt).toContain("0.6–0.75");
      expect(prompt).toContain("Character whose face or costume identity must stay locked");
    },
  );

  it.each(videoCfgControlProviders)(
    "includes the proactive suggestion sentence for video provider $id",
    ({ id }) => {
      const prompt = buildAssetLibrarySuzziePrompt({ mode: "i2v", provider: id });
      expect(prompt).toContain("Proactively suggest a");
      expect(prompt).toContain("how do I stop the label from warping");
    },
  );

  it.each(videoCfgControlProviders)(
    "includes suggestedCfgScale in the response-format section for video provider $id",
    ({ id }) => {
      const prompt = buildAssetLibrarySuzziePrompt({ mode: "i2v", provider: id });
      const formatIdx = prompt.indexOf("## Response Format");
      expect(formatIdx).toBeGreaterThanOrEqual(0);
      const formatSection = prompt.slice(formatIdx);
      expect(formatSection).toContain("suggestedCfgScale");
    },
  );
});

describe("buildSuzzieSystemPrompt — IP-Adapter guidance injection for image providers", () => {
  it.each(imageIpAdapterProviders)(
    "includes the IP-Adapter block for image provider $id (ipAdapterSupport)",
    ({ id, ipAdapterSupport }) => {
      const prompt = buildSuzzieSystemPrompt({ provider: id });
      expect(prompt).toContain("IP-Adapter Syntax");
      expect(prompt).toContain("Style and Content Conditioning");
      expect(prompt).toContain(id);
      expect(prompt).toContain(ipAdapterSupport!.promptSyntax ?? "@ipRef");
      const idx = prompt.indexOf("IP-Adapter Syntax");
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(prompt.slice(idx)).toContain(id);
    },
  );

  it.each(videoIpAdapterProviders)(
    "includes the IP-Adapter block for video provider $id (ipAdapterSupport)",
    ({ id, ipAdapterSupport }) => {
      const prompt = buildSuzzieSystemPrompt({ provider: id });
      expect(prompt).toContain("IP-Adapter Syntax");
      expect(prompt).toContain("Style and Content Conditioning");
      expect(prompt).toContain(id);
      expect(prompt).toContain(ipAdapterSupport!.promptSyntax ?? "@ipRef");
      const idx = prompt.indexOf("IP-Adapter Syntax");
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(prompt.slice(idx)).toContain(id);
    },
  );

  it("omits the IP-Adapter block when provider is runway (no ipAdapterSupport)", () => {
    const prompt = buildSuzzieSystemPrompt({ provider: "runway" });
    expect(prompt).not.toContain("IP-Adapter Syntax");
    expect(prompt).not.toContain("Style and Content Conditioning");
  });

  it("omits the IP-Adapter block when no provider is supplied", () => {
    const prompt = buildSuzzieSystemPrompt({});
    expect(prompt).not.toContain("IP-Adapter Syntax");
    expect(prompt).not.toContain("Style and Content Conditioning");
  });
});

describe("buildAssetLibrarySuzziePrompt — IP-Adapter guidance injection for image providers", () => {
  it.each(imageIpAdapterProviders)(
    "includes the IP-Adapter block for image provider $id (ipAdapterSupport)",
    ({ id, ipAdapterSupport }) => {
      const prompt = buildAssetLibrarySuzziePrompt({ mode: "t2i", provider: id });
      expect(prompt).toContain("IP-Adapter Syntax");
      expect(prompt).toContain("Style and Content Conditioning");
      expect(prompt).toContain(id);
      expect(prompt).toContain(ipAdapterSupport!.promptSyntax ?? "@ipRef");
    },
  );

  it.each(videoIpAdapterProviders)(
    "includes the IP-Adapter block for video provider $id (ipAdapterSupport)",
    ({ id, ipAdapterSupport }) => {
      const prompt = buildAssetLibrarySuzziePrompt({ mode: "i2v", provider: id });
      expect(prompt).toContain("IP-Adapter Syntax");
      expect(prompt).toContain("Style and Content Conditioning");
      expect(prompt).toContain(id);
      expect(prompt).toContain(ipAdapterSupport!.promptSyntax ?? "@ipRef");
    },
  );

  it("omits the IP-Adapter block when provider is runway (no ipAdapterSupport)", () => {
    const prompt = buildAssetLibrarySuzziePrompt({ mode: "t2v", provider: "runway" });
    expect(prompt).not.toContain("IP-Adapter Syntax");
    expect(prompt).not.toContain("Style and Content Conditioning");
  });

  it("omits the IP-Adapter block when no provider is supplied", () => {
    const prompt = buildAssetLibrarySuzziePrompt({ mode: "t2i" });
    expect(prompt).not.toContain("IP-Adapter Syntax");
    expect(prompt).not.toContain("Style and Content Conditioning");
  });
});

const MOCK_VIDEO_PROVIDER_ID = "__test_mock_video_provider__";
const MOCK_IMAGE_PROVIDER_ID = "__test_mock_image_provider__";

describe("buildSuzzieSystemPrompt — registry-injection: mock provider capabilities appear in output", () => {
  beforeEach(() => {
    (VIDEO_PROVIDERS as Record<string, unknown>)[MOCK_VIDEO_PROVIDER_ID] = {
      id: MOCK_VIDEO_PROVIDER_ID,
      name: MOCK_VIDEO_PROVIDER_ID,
      displayName: "Mock Video Provider",
      description: "A mock provider for testing",
      costPerSecond: 0.01,
      maxDuration: 8,
      strengths: ["testing"],
      weaknesses: [],
      bestFor: ["test"],
      tier: "standard" as const,
      multiImageSupport: {
        maxImages: 4,
        promptSyntax: "@mockImageN",
        hint: "Use @mockImageN syntax",
      },
      cfgControlSupport: {
        minCfg: 0.1,
        maxCfg: 1.0,
        defaultCfg: 0.7,
        hint: "Adjust cfg_scale for fidelity",
      },
      ipAdapterSupport: {
        maxAdapters: 2,
        promptSyntax: "@mockIpRef",
        hint: "Use @mockIpRef for style conditioning",
      },
    };
  });

  afterEach(() => {
    delete (VIDEO_PROVIDERS as Record<string, unknown>)[MOCK_VIDEO_PROVIDER_ID];
  });

  it("includes mock provider display name and id in provider knowledge section", () => {
    const prompt = buildSuzzieSystemPrompt({ provider: MOCK_VIDEO_PROVIDER_ID });
    expect(prompt).toContain(MOCK_VIDEO_PROVIDER_ID);
    expect(prompt).toContain("Mock Video Provider");
  });

  it("picks up multiImageSupport from mock provider: @imageN syntax block is injected", () => {
    const prompt = buildSuzzieSystemPrompt({ provider: MOCK_VIDEO_PROVIDER_ID });
    expect(prompt).toContain("@imageN Syntax");
    expect(prompt).toContain(MOCK_VIDEO_PROVIDER_ID);
    expect(prompt).toMatch(/supports up to 4 reference images/);
  });

  it("picks up multiImageSupport from mock provider: syntax token appears in capability matrix", () => {
    const prompt = buildSuzzieSystemPrompt({ provider: MOCK_VIDEO_PROVIDER_ID });
    const matrixStart = prompt.indexOf("## Provider Capability Matrix");
    expect(matrixStart).toBeGreaterThanOrEqual(0);
    const matrixSection = prompt.slice(matrixStart);
    expect(matrixSection).toContain("Mock Video Provider");
    expect(matrixSection).toContain("@mockImageN");
  });

  it("picks up cfgControlSupport from mock provider: CFG block is injected", () => {
    const prompt = buildSuzzieSystemPrompt({ provider: MOCK_VIDEO_PROVIDER_ID });
    expect(prompt).toContain("CFG Scale Control");
    expect(prompt).toContain("Source Frame Fidelity");
    expect(prompt).toContain("cfg_scale");
    expect(prompt).toMatch(/cfg_scale tuning in the range 0\.1/);
  });

  it("picks up cfgControlSupport from mock provider: capability matrix CFG row lists mock provider", () => {
    const prompt = buildSuzzieSystemPrompt({ provider: MOCK_VIDEO_PROVIDER_ID });
    const matrixStart = prompt.indexOf("## Provider Capability Matrix");
    expect(matrixStart).toBeGreaterThanOrEqual(0);
    const matrixSection = prompt.slice(matrixStart);
    expect(matrixSection).toContain("Mock Video Provider");
    expect(matrixSection).toMatch(/CFG scale.*source-frame fidelity.*video/i);
  });

  it("picks up ipAdapterSupport from mock provider: IP-Adapter block is injected", () => {
    const prompt = buildSuzzieSystemPrompt({ provider: MOCK_VIDEO_PROVIDER_ID });
    expect(prompt).toContain("IP-Adapter Syntax");
    expect(prompt).toContain("Style and Content Conditioning");
    expect(prompt).toContain("@mockIpRef");
  });

  it("picks up ipAdapterSupport from mock provider: capability matrix IP-Adapter row lists mock provider", () => {
    const prompt = buildSuzzieSystemPrompt({ provider: MOCK_VIDEO_PROVIDER_ID });
    const matrixStart = prompt.indexOf("## Provider Capability Matrix");
    expect(matrixStart).toBeGreaterThanOrEqual(0);
    const matrixSection = prompt.slice(matrixStart);
    expect(matrixSection).toContain("Mock Video Provider");
    expect(matrixSection).toContain("@mockIpRef");
  });
});

describe("buildSuzzieSystemPrompt — registry-injection: mock image provider capabilities appear in output", () => {
  beforeEach(() => {
    (IMAGE_PROVIDERS as Record<string, unknown>)[MOCK_IMAGE_PROVIDER_ID] = {
      id: MOCK_IMAGE_PROVIDER_ID,
      name: MOCK_IMAGE_PROVIDER_ID,
      displayName: "Mock Image Provider",
      description: "A mock image provider for testing",
      strengths: ["testing"],
      bestFor: ["test"],
      multiImageSupport: {
        maxImages: 3,
        promptSyntax: "@mockImgRef",
        hint: "Use @mockImgRef syntax",
      },
      cfgControlSupport: {
        minCfg: 0.2,
        maxCfg: 0.9,
        defaultCfg: 0.5,
        hint: "Adjust cfg_scale",
      },
      ipAdapterSupport: {
        maxAdapters: 1,
        promptSyntax: "@mockImgIpRef",
        hint: "Use @mockImgIpRef for conditioning",
      },
    };
  });

  afterEach(() => {
    delete (IMAGE_PROVIDERS as Record<string, unknown>)[MOCK_IMAGE_PROVIDER_ID];
  });

  it("includes mock image provider in provider knowledge section", () => {
    const prompt = buildSuzzieSystemPrompt({ provider: MOCK_IMAGE_PROVIDER_ID });
    expect(prompt).toContain(MOCK_IMAGE_PROVIDER_ID);
    expect(prompt).toContain("Mock Image Provider");
  });

  it("picks up multiImageSupport from mock image provider: @imageN block is injected", () => {
    const prompt = buildSuzzieSystemPrompt({ provider: MOCK_IMAGE_PROVIDER_ID });
    expect(prompt).toContain("@imageN Syntax");
    expect(prompt).toMatch(/supports up to 3 reference images/);
  });

  it("picks up cfgControlSupport from mock image provider: CFG block is injected", () => {
    const prompt = buildSuzzieSystemPrompt({ provider: MOCK_IMAGE_PROVIDER_ID });
    expect(prompt).toContain("CFG Scale Control");
    expect(prompt).toContain("cfg_scale");
  });

  it("picks up ipAdapterSupport from mock image provider: IP-Adapter block is injected", () => {
    const prompt = buildSuzzieSystemPrompt({ provider: MOCK_IMAGE_PROVIDER_ID });
    expect(prompt).toContain("IP-Adapter Syntax");
    expect(prompt).toContain("@mockImgIpRef");
  });
});

describe("buildCapabilityMatrix (via buildSuzzieSystemPrompt) — only providers with a capability appear in that row", () => {
  const MOCK_CFG_ONLY_ID = "__test_cfg_only__";
  const MOCK_MULTI_ONLY_ID = "__test_multi_only__";

  beforeEach(() => {
    (VIDEO_PROVIDERS as Record<string, unknown>)[MOCK_CFG_ONLY_ID] = {
      id: MOCK_CFG_ONLY_ID,
      name: MOCK_CFG_ONLY_ID,
      displayName: "Mock CFG-Only Provider",
      description: "Only has cfgControlSupport",
      costPerSecond: 0.01,
      maxDuration: 8,
      strengths: ["cfg"],
      weaknesses: [],
      bestFor: ["test"],
      tier: "standard" as const,
      cfgControlSupport: {
        minCfg: 0.0,
        maxCfg: 1.0,
        defaultCfg: 0.5,
        hint: "cfg only",
      },
    };

    (VIDEO_PROVIDERS as Record<string, unknown>)[MOCK_MULTI_ONLY_ID] = {
      id: MOCK_MULTI_ONLY_ID,
      name: MOCK_MULTI_ONLY_ID,
      displayName: "Mock MultiImage-Only Provider",
      description: "Only has multiImageSupport",
      costPerSecond: 0.01,
      maxDuration: 8,
      strengths: ["multi"],
      weaknesses: [],
      bestFor: ["test"],
      tier: "standard" as const,
      multiImageSupport: {
        maxImages: 2,
        promptSyntax: "@multiOnlySyntax",
        hint: "multi only",
      },
    };
  });

  afterEach(() => {
    delete (VIDEO_PROVIDERS as Record<string, unknown>)[MOCK_CFG_ONLY_ID];
    delete (VIDEO_PROVIDERS as Record<string, unknown>)[MOCK_MULTI_ONLY_ID];
  });

  it("capability matrix CFG row contains the CFG-only provider but not the multi-only provider", () => {
    const prompt = buildSuzzieSystemPrompt({});
    const matrixStart = prompt.indexOf("## Provider Capability Matrix");
    expect(matrixStart).toBeGreaterThanOrEqual(0);
    const matrixSection = prompt.slice(matrixStart);

    const CFG_ROW_MARKER = "**CFG scale / source-frame fidelity (video):**";
    const cfgRowStart = matrixSection.indexOf(CFG_ROW_MARKER);
    expect(cfgRowStart).toBeGreaterThanOrEqual(0);
    const cfgRowEnd = matrixSection.indexOf('\n', cfgRowStart);
    const cfgRow = matrixSection.slice(cfgRowStart, cfgRowEnd === -1 ? undefined : cfgRowEnd);
    expect(cfgRow).toContain("Mock CFG-Only Provider");
    expect(cfgRow).not.toContain("Mock MultiImage-Only Provider");
  });

  it("capability matrix multi-image video row contains the multi-only provider but not the CFG-only provider", () => {
    const prompt = buildSuzzieSystemPrompt({});
    const matrixStart = prompt.indexOf("## Provider Capability Matrix");
    expect(matrixStart).toBeGreaterThanOrEqual(0);
    const matrixSection = prompt.slice(matrixStart);

    const MULTI_ROW_MARKER = "**Multi-image @imageN (video):**";
    const multiRowStart = matrixSection.indexOf(MULTI_ROW_MARKER);
    expect(multiRowStart).toBeGreaterThanOrEqual(0);
    const multiRowEnd = matrixSection.indexOf('\n', multiRowStart);
    const multiRow = matrixSection.slice(multiRowStart, multiRowEnd === -1 ? undefined : multiRowEnd);
    expect(multiRow).toContain("Mock MultiImage-Only Provider");
    expect(multiRow).not.toContain("Mock CFG-Only Provider");
  });

  it("capability matrix omits a row entirely when no provider has that capability", () => {
    const prompt = buildSuzzieSystemPrompt({});
    const matrixStart = prompt.indexOf("## Provider Capability Matrix");
    expect(matrixStart).toBeGreaterThanOrEqual(0);
    const matrixSection = prompt.slice(matrixStart);
    expect(matrixSection).toContain("## Provider Capability Matrix");
    expect(matrixSection.length).toBeGreaterThan(50);
  });

  it("a provider stripped of cfgControlSupport no longer appears in the CFG capability matrix row", () => {
    const entry = (VIDEO_PROVIDERS as Record<string, Record<string, unknown>>)[MOCK_CFG_ONLY_ID];
    const saved = entry.cfgControlSupport;
    delete entry.cfgControlSupport;
    try {
      const prompt = buildSuzzieSystemPrompt({});
      const matrixStart = prompt.indexOf("## Provider Capability Matrix");
      const matrixSection = prompt.slice(matrixStart);
      const cfgLineMatch = matrixSection.match(/\*\*CFG scale[^*]*\*\*:([^\n]*)/i);
      if (cfgLineMatch) {
        expect(cfgLineMatch[1]).not.toContain("Mock CFG-Only Provider");
      }
    } finally {
      entry.cfgControlSupport = saved;
    }
  });
});
