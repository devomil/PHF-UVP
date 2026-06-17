import { describe, it, expect } from 'vitest';
import { providerSupportsMultiImage } from '../provider-catalog';
import { getMultiImageSupport } from '../provider-config';

// Providers that carry multiImageSupport in provider-config.ts
const MULTI_IMAGE_PROVIDERS = [
  'kling',
  'kling-1.6',
  'kling-2.0',
  'kling-2.1',
  'kling-2.5',
  'kling-2.5-turbo',
  'kling-2.6',
  'kling-2.6-pro',
  'kling-2.1-master',
  'seedance-2.0',
  'seedance-2.0-fast',
];

// Providers (or pseudo-ids) that must NOT show the badge
const NON_MULTI_IMAGE_PROVIDERS = [
  'auto',
  'runway',
  'runway-4.5',
  'runway-gen4',
  'runway-gen4-aleph',
  'runway-act-two',
  'luma',
  'hailuo',
  'veo-3.1',
  'wan-2.6',
  'pika',
  'sora-2',
  'sora-2-pro',
  'hunyuan',
  'seedance-1.0',
  'kling-effects',
  'kling-avatar',
  'kling-2.6-motion-control',
  'kling-2.6-motion-control-pro',
  'omni-human-1.5',
  'omniavatar',
  'remotion-motion-graphics',
];

describe('providerSupportsMultiImage', () => {
  it.each(MULTI_IMAGE_PROVIDERS)(
    'returns true for %s',
    (id) => {
      expect(providerSupportsMultiImage(id)).toBe(true);
    },
  );

  it.each(NON_MULTI_IMAGE_PROVIDERS)(
    'returns false for %s',
    (id) => {
      expect(providerSupportsMultiImage(id)).toBe(false);
    },
  );

  it('returns false for undefined', () => {
    expect(providerSupportsMultiImage(undefined)).toBe(false);
  });

  it('returns false for null', () => {
    expect(providerSupportsMultiImage(null)).toBe(false);
  });

  it('returns false for an empty string', () => {
    expect(providerSupportsMultiImage('')).toBe(false);
  });

  it('returns false for an unknown provider id', () => {
    expect(providerSupportsMultiImage('totally-unknown-provider')).toBe(false);
  });
});

describe('getMultiImageSupport', () => {
  it('returns a config object for kling', () => {
    const support = getMultiImageSupport('kling');
    expect(support).not.toBeNull();
    expect(support!.maxImages).toBeGreaterThan(0);
    expect(typeof support!.hint).toBe('string');
    expect(support!.hint.length).toBeGreaterThan(0);
  });

  it('returns a config object for seedance-2.0 with @imageN syntax', () => {
    const support = getMultiImageSupport('seedance-2.0');
    expect(support).not.toBeNull();
    expect(support!.maxImages).toBeGreaterThan(0);
    expect(support!.promptSyntax).toBeTruthy();
  });

  it('returns null for a non-multi-image provider', () => {
    expect(getMultiImageSupport('luma')).toBeNull();
  });

  it('returns null for auto', () => {
    expect(getMultiImageSupport('auto')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(getMultiImageSupport('')).toBeNull();
  });

  it('config maxImages is consistent with providerSupportsMultiImage', () => {
    for (const id of MULTI_IMAGE_PROVIDERS) {
      const support = getMultiImageSupport(id);
      expect(support).not.toBeNull();
      expect(providerSupportsMultiImage(id)).toBe(true);
    }
    for (const id of NON_MULTI_IMAGE_PROVIDERS) {
      expect(getMultiImageSupport(id)).toBeNull();
    }
  });
});
