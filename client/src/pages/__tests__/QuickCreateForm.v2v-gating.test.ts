/**
 * Unit tests for V2V provider gating in the QuickCreateForm
 * (embedded inside new-project.tsx).
 *
 * These tests import the actual gating helpers from @/utils/v2v-gating —
 * the same module used by the component — so any change to the production
 * gating logic immediately breaks these assertions.
 */

import { describe, it, expect } from 'vitest';
import {
  QC_MODE_GATING,
  isQCProviderSectionVisible,
  isQCAmberBannerVisible,
  isQCGenerateButtonDisabled,
  wouldQCHandleSubmitBlock,
  type QuickCreateMode,
} from '@/utils/v2v-gating';

// ── QC_MODE_GATING shape ──────────────────────────────────────────────────────

describe('QC_MODE_GATING – V2V shape', () => {
  it('v2v mode requires a reference video', () => {
    expect(QC_MODE_GATING['v2v'].needsRefVideo).toBe(true);
  });

  it('v2v mode produces video output', () => {
    expect(QC_MODE_GATING['v2v'].outputType).toBe('video');
  });

  it('v2v mode does NOT require a reference image', () => {
    expect(QC_MODE_GATING['v2v'].needsRefImage).toBe(false);
  });

  it('non-v2v modes do not require a reference video', () => {
    for (const m of ['t2i', 't2v', 'i2i', 'i2v'] as QuickCreateMode[]) {
      expect(QC_MODE_GATING[m].needsRefVideo).toBe(false);
    }
  });
});

// ── Provider section visibility ───────────────────────────────────────────────

describe('isQCProviderSectionVisible – V2V gating', () => {
  it('hides provider section in v2v mode when no reference video is set', () => {
    expect(isQCProviderSectionVisible('v2v', '')).toBe(false);
  });

  it('shows provider section in v2v mode once a reference video URL is provided', () => {
    expect(isQCProviderSectionVisible('v2v', 'https://cdn.example.com/clip.mp4')).toBe(true);
  });

  it('always shows provider section for t2v mode regardless of referenceVideoUrl', () => {
    expect(isQCProviderSectionVisible('t2v', '')).toBe(true);
    expect(isQCProviderSectionVisible('t2v', 'https://cdn.example.com/clip.mp4')).toBe(true);
  });

  it('always shows provider section for i2v mode regardless of referenceVideoUrl', () => {
    expect(isQCProviderSectionVisible('i2v', '')).toBe(true);
    expect(isQCProviderSectionVisible('i2v', 'https://cdn.example.com/clip.mp4')).toBe(true);
  });

  it('always shows provider section for image modes regardless of referenceVideoUrl', () => {
    for (const m of ['t2i', 'i2i'] as QuickCreateMode[]) {
      expect(isQCProviderSectionVisible(m, '')).toBe(true);
    }
  });
});

// ── Amber warning banner ──────────────────────────────────────────────────────

describe('isQCAmberBannerVisible – V2V gating', () => {
  it('shows amber banner in v2v mode when no reference video is set', () => {
    expect(isQCAmberBannerVisible('v2v', '')).toBe(true);
  });

  it('hides amber banner in v2v mode once a reference video URL is provided', () => {
    expect(isQCAmberBannerVisible('v2v', 'https://cdn.example.com/clip.mp4')).toBe(false);
  });

  it('never shows amber banner for non-v2v modes (they do not need a reference video)', () => {
    for (const m of ['t2i', 't2v', 'i2i', 'i2v'] as QuickCreateMode[]) {
      expect(isQCAmberBannerVisible(m, '')).toBe(false);
    }
  });
});

// ── Generate button disabled state ────────────────────────────────────────────

describe('isQCGenerateButtonDisabled – V2V gating', () => {
  it('disables button in v2v mode when reference video is absent (even with a prompt)', () => {
    expect(isQCGenerateButtonDisabled('v2v', 'make it cinematic', '')).toBe(true);
  });

  it('enables button in v2v mode when both prompt and reference video are present', () => {
    expect(isQCGenerateButtonDisabled('v2v', 'make it cinematic', 'https://cdn.example.com/clip.mp4')).toBe(false);
  });

  it('disables button in v2v mode when prompt is empty regardless of video', () => {
    expect(isQCGenerateButtonDisabled('v2v', '', 'https://cdn.example.com/clip.mp4')).toBe(true);
  });

  it('disables button in v2v mode when both prompt and video are absent', () => {
    expect(isQCGenerateButtonDisabled('v2v', '', '')).toBe(true);
  });

  it('does NOT disable button for t2v mode due to missing referenceVideoUrl', () => {
    expect(isQCGenerateButtonDisabled('t2v', 'a sunset over the ocean', '')).toBe(false);
  });

  it('does NOT disable button for i2v mode due to missing referenceVideoUrl', () => {
    expect(isQCGenerateButtonDisabled('i2v', 'animate gently', '')).toBe(false);
  });

  it('disables button for t2v mode only when prompt is empty', () => {
    expect(isQCGenerateButtonDisabled('t2v', '', '')).toBe(true);
    expect(isQCGenerateButtonDisabled('t2v', 'a prompt', '')).toBe(false);
  });

  it('disables button while video upload is in progress in v2v mode (even with valid prompt and URL)', () => {
    expect(isQCGenerateButtonDisabled('v2v', 'make it cinematic', 'https://cdn.example.com/clip.mp4', true)).toBe(true);
  });

  it('enables button once upload completes in v2v mode (isUploadingVideo false)', () => {
    expect(isQCGenerateButtonDisabled('v2v', 'make it cinematic', 'https://cdn.example.com/clip.mp4', false)).toBe(false);
  });

  it('disables button while video upload is in progress for non-v2v modes too', () => {
    expect(isQCGenerateButtonDisabled('t2v', 'a sunset over the ocean', '', true)).toBe(true);
  });

  it('disables button while image upload is in progress for i2v mode (even with valid prompt)', () => {
    expect(isQCGenerateButtonDisabled('i2v', 'animate gently', '', false, true)).toBe(true);
  });

  it('enables button for i2v once image upload completes (isUploadingImage false)', () => {
    expect(isQCGenerateButtonDisabled('i2v', 'animate gently', '', false, false)).toBe(false);
  });

  it('disables button while image upload is in progress for i2i mode', () => {
    expect(isQCGenerateButtonDisabled('i2i', 'make it look like a painting', '', false, true)).toBe(true);
  });

  it('disables button while image upload is in progress for t2i mode', () => {
    expect(isQCGenerateButtonDisabled('t2i', 'a beautiful landscape', '', false, true)).toBe(true);
  });

  it('enables button for t2i once image upload completes', () => {
    expect(isQCGenerateButtonDisabled('t2i', 'a beautiful landscape', '', false, false)).toBe(false);
  });
});

// ── handleSubmit early-return guard ───────────────────────────────────────────

describe('wouldQCHandleSubmitBlock – V2V gating', () => {
  it('blocks submission in v2v mode when reference video is missing', () => {
    expect(wouldQCHandleSubmitBlock('v2v', '')).toBe(true);
  });

  it('allows submission in v2v mode when reference video is present', () => {
    expect(wouldQCHandleSubmitBlock('v2v', 'https://cdn.example.com/clip.mp4')).toBe(false);
  });

  it('does not block submission for non-v2v modes even without a video URL', () => {
    for (const m of ['t2i', 't2v', 'i2i', 'i2v'] as QuickCreateMode[]) {
      expect(wouldQCHandleSubmitBlock(m, '')).toBe(false);
    }
  });
});
