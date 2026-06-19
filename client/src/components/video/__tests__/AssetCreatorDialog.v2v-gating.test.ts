/**
 * Unit tests for V2V provider gating in AssetCreatorDialog.
 *
 * These tests import the actual gating helpers from @/utils/v2v-gating —
 * the same module used by the component — so any change to the production
 * gating logic immediately breaks these assertions.
 */

import { describe, it, expect } from 'vitest';
import {
  ASSET_CREATOR_MODE_GATING,
  isRunwayV2V,
  isReplacementImageSectionVisible,
  isAssetCreatorProviderSelectorVisible,
  isAssetCreatorAmberWarningVisible,
  computeAssetCreatorCanSubmit,
  type AssetCreatorMode,
} from '@/utils/v2v-gating';

// ── MODE_CONFIG shape ─────────────────────────────────────────────────────────

describe('ASSET_CREATOR_MODE_GATING – V2V shape', () => {
  it('v2v mode requires a reference video', () => {
    expect(ASSET_CREATOR_MODE_GATING['v2v'].needsRefVideo).toBe(true);
  });

  it('v2v mode does NOT require a reference image', () => {
    expect(ASSET_CREATOR_MODE_GATING['v2v'].needsRefImage).toBe(false);
  });

  it('v2v mode requires a prompt', () => {
    expect(ASSET_CREATOR_MODE_GATING['v2v'].needsPrompt).toBe(true);
  });

  it('v2v mode has transform category', () => {
    expect(ASSET_CREATOR_MODE_GATING['v2v'].category).toBe('transform');
  });

  it('non-v2v video modes do not require a reference video', () => {
    for (const m of ['t2v', 'i2v', 't2i', 'i2i'] as AssetCreatorMode[]) {
      expect(ASSET_CREATOR_MODE_GATING[m].needsRefVideo).toBe(false);
    }
  });
});

// ── isRunwayV2V ───────────────────────────────────────────────────────────────

describe('isRunwayV2V', () => {
  it('returns true for runway-gen4-aleph', () => {
    expect(isRunwayV2V('runway-gen4-aleph')).toBe(true);
  });

  it('returns true for any runway-prefixed provider', () => {
    expect(isRunwayV2V('runway-act-two')).toBe(true);
  });

  it('returns false for kling providers', () => {
    expect(isRunwayV2V('kling-2.6')).toBe(false);
  });

  it('returns false for auto provider', () => {
    expect(isRunwayV2V('auto')).toBe(false);
  });
});

// ── Provider selector visibility ──────────────────────────────────────────────

describe('isAssetCreatorProviderSelectorVisible – V2V gating', () => {
  it('hides provider selector in v2v mode when no reference video is set', () => {
    expect(isAssetCreatorProviderSelectorVisible('v2v', '')).toBe(false);
  });

  it('shows provider selector in v2v mode once a reference video URL is provided', () => {
    expect(isAssetCreatorProviderSelectorVisible('v2v', 'https://cdn.example.com/clip.mp4')).toBe(true);
  });

  it('always shows provider selector for t2v mode regardless of referenceVideoUrl', () => {
    expect(isAssetCreatorProviderSelectorVisible('t2v', '')).toBe(true);
    expect(isAssetCreatorProviderSelectorVisible('t2v', 'https://cdn.example.com/clip.mp4')).toBe(true);
  });

  it('always shows provider selector for i2v mode regardless of referenceVideoUrl', () => {
    expect(isAssetCreatorProviderSelectorVisible('i2v', '')).toBe(true);
  });

  it('always shows provider selector for image modes', () => {
    expect(isAssetCreatorProviderSelectorVisible('t2i', '')).toBe(true);
    expect(isAssetCreatorProviderSelectorVisible('i2i', '')).toBe(true);
  });

  it('hides provider selector for toolkit modes regardless of referenceVideoUrl', () => {
    for (const m of ['upscale-image', 'upscale-video', 'bg-remove-image', 'bg-remove-video'] as AssetCreatorMode[]) {
      expect(isAssetCreatorProviderSelectorVisible(m, '')).toBe(false);
      expect(isAssetCreatorProviderSelectorVisible(m, 'https://cdn.example.com/clip.mp4')).toBe(false);
    }
  });

  it('hides provider selector for character-performance mode', () => {
    expect(isAssetCreatorProviderSelectorVisible('character-performance', '')).toBe(false);
    expect(isAssetCreatorProviderSelectorVisible('character-performance', 'https://cdn.example.com/clip.mp4')).toBe(false);
  });

  it('hides provider selector for character mode', () => {
    expect(isAssetCreatorProviderSelectorVisible('character', '')).toBe(false);
  });
});

// ── Amber warning banner ──────────────────────────────────────────────────────

describe('isAssetCreatorAmberWarningVisible – V2V gating', () => {
  it('shows amber warning when mode is v2v and no reference video is set', () => {
    expect(isAssetCreatorAmberWarningVisible('v2v', '')).toBe(true);
  });

  it('hides amber warning when mode is v2v and a reference video URL is present', () => {
    expect(isAssetCreatorAmberWarningVisible('v2v', 'https://cdn.example.com/clip.mp4')).toBe(false);
  });

  it('never shows amber warning for non-v2v modes', () => {
    for (const m of ['t2v', 'i2v', 't2i', 'i2i'] as AssetCreatorMode[]) {
      expect(isAssetCreatorAmberWarningVisible(m, '')).toBe(false);
    }
  });
});

// ── canSubmit / generate button disabled ──────────────────────────────────────

describe('computeAssetCreatorCanSubmit – V2V gating', () => {
  const baseV2V = {
    mode: 'v2v' as AssetCreatorMode,
    prompt: 'replace the car with a bus',
    referenceImageUrl: '',
    replacementImageUrl: '',
    provider: 'runway-gen4-aleph',
  };

  it('disables submit when v2v mode has no reference video', () => {
    expect(computeAssetCreatorCanSubmit({ ...baseV2V, referenceVideoUrl: '' })).toBe(false);
  });

  it('enables submit when v2v mode has a reference video (Runway provider)', () => {
    expect(computeAssetCreatorCanSubmit({ ...baseV2V, referenceVideoUrl: 'https://cdn.example.com/clip.mp4' })).toBe(true);
  });

  it('disables submit for non-Runway v2v when replacement image is also missing', () => {
    expect(
      computeAssetCreatorCanSubmit({
        ...baseV2V,
        referenceVideoUrl: 'https://cdn.example.com/clip.mp4',
        replacementImageUrl: '',
        provider: 'kling-2.6',
      }),
    ).toBe(false);
  });

  it('enables submit for non-Runway v2v when both video and replacement image are present', () => {
    expect(
      computeAssetCreatorCanSubmit({
        ...baseV2V,
        referenceVideoUrl: 'https://cdn.example.com/clip.mp4',
        replacementImageUrl: 'https://cdn.example.com/img.png',
        provider: 'kling-2.6',
      }),
    ).toBe(true);
  });

  it('disables submit when v2v mode has video but an empty prompt', () => {
    expect(
      computeAssetCreatorCanSubmit({
        ...baseV2V,
        referenceVideoUrl: 'https://cdn.example.com/clip.mp4',
        prompt: '',
      }),
    ).toBe(false);
  });

  it('submit is not gated on referenceVideoUrl for t2v mode', () => {
    expect(
      computeAssetCreatorCanSubmit({
        mode: 't2v',
        prompt: 'a beautiful sunset',
        referenceImageUrl: '',
        referenceVideoUrl: '',
        replacementImageUrl: '',
        provider: 'auto',
      }),
    ).toBe(true);
  });

  it('submit is not gated on referenceVideoUrl for i2v mode when image is present', () => {
    expect(
      computeAssetCreatorCanSubmit({
        mode: 'i2v',
        prompt: 'animate gently',
        referenceImageUrl: 'https://cdn.example.com/img.png',
        referenceVideoUrl: '',
        replacementImageUrl: '',
        provider: 'auto',
      }),
    ).toBe(true);
  });

  it('disables submit while video upload is in progress (even when all other fields are valid)', () => {
    expect(
      computeAssetCreatorCanSubmit({
        ...baseV2V,
        referenceVideoUrl: 'https://cdn.example.com/clip.mp4',
        isUploadingVideo: true,
      }),
    ).toBe(false);
  });

  it('enables submit once upload completes (isUploadingVideo false, video URL present)', () => {
    expect(
      computeAssetCreatorCanSubmit({
        ...baseV2V,
        referenceVideoUrl: 'https://cdn.example.com/clip.mp4',
        isUploadingVideo: false,
      }),
    ).toBe(true);
  });

  it('disables submit while video upload is in progress for non-v2v modes too', () => {
    expect(
      computeAssetCreatorCanSubmit({
        mode: 't2v',
        prompt: 'a beautiful sunset',
        referenceImageUrl: '',
        referenceVideoUrl: '',
        replacementImageUrl: '',
        provider: 'auto',
        isUploadingVideo: true,
      }),
    ).toBe(false);
  });

  it('disables submit while image upload is in progress for i2v mode (even when all other fields are valid)', () => {
    expect(
      computeAssetCreatorCanSubmit({
        mode: 'i2v',
        prompt: 'animate gently',
        referenceImageUrl: 'https://cdn.example.com/img.png',
        referenceVideoUrl: '',
        replacementImageUrl: '',
        provider: 'auto',
        isUploadingImage: true,
      }),
    ).toBe(false);
  });

  it('enables submit for i2v once image upload completes (isUploadingImage false, image URL present)', () => {
    expect(
      computeAssetCreatorCanSubmit({
        mode: 'i2v',
        prompt: 'animate gently',
        referenceImageUrl: 'https://cdn.example.com/img.png',
        referenceVideoUrl: '',
        replacementImageUrl: '',
        provider: 'auto',
        isUploadingImage: false,
      }),
    ).toBe(true);
  });

  it('disables submit while image upload is in progress for i2i mode', () => {
    expect(
      computeAssetCreatorCanSubmit({
        mode: 'i2i',
        prompt: 'make it look like a painting',
        referenceImageUrl: 'https://cdn.example.com/img.png',
        referenceVideoUrl: '',
        replacementImageUrl: '',
        provider: 'auto',
        isUploadingImage: true,
      }),
    ).toBe(false);
  });

  it('disables submit while image upload is in progress even for t2i mode', () => {
    expect(
      computeAssetCreatorCanSubmit({
        mode: 't2i',
        prompt: 'a beautiful landscape',
        referenceImageUrl: '',
        referenceVideoUrl: '',
        replacementImageUrl: '',
        provider: 'auto',
        isUploadingImage: true,
      }),
    ).toBe(false);
  });
});

// ── isReplacementImageSectionVisible ──────────────────────────────────────────

describe('isReplacementImageSectionVisible – Kling / non-Runway V2V gating', () => {
  it('shows the section for v2v mode with a non-Runway provider (kling-2.6)', () => {
    expect(isReplacementImageSectionVisible('v2v', 'kling-2.6')).toBe(true);
  });

  it('shows the section for v2v mode with another non-Runway provider', () => {
    expect(isReplacementImageSectionVisible('v2v', 'auto')).toBe(true);
  });

  it('hides the section for v2v mode when provider is Runway (runway-gen4-aleph)', () => {
    expect(isReplacementImageSectionVisible('v2v', 'runway-gen4-aleph')).toBe(false);
  });

  it('hides the section for v2v mode when provider is any runway-prefixed variant', () => {
    expect(isReplacementImageSectionVisible('v2v', 'runway-act-two')).toBe(false);
  });

  it('hides the section for non-v2v modes even with a non-Runway provider', () => {
    for (const m of ['t2v', 'i2v', 't2i', 'i2i'] as AssetCreatorMode[]) {
      expect(isReplacementImageSectionVisible(m, 'kling-2.6')).toBe(false);
    }
  });

  it('hides the section for toolkit modes', () => {
    for (const m of ['upscale-image', 'upscale-video', 'bg-remove-image', 'bg-remove-video'] as AssetCreatorMode[]) {
      expect(isReplacementImageSectionVisible(m, 'kling-2.6')).toBe(false);
    }
  });

  it('hides the section for character modes', () => {
    expect(isReplacementImageSectionVisible('character', 'kling-2.6')).toBe(false);
    expect(isReplacementImageSectionVisible('character-performance', 'kling-2.6')).toBe(false);
  });
});
