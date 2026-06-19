import { describe, it, expect } from 'vitest';
import {
  providerSupportsMultiImage,
  IMAGE_PROVIDER_CATALOG,
  VIDEO_PROVIDER_CATALOG,
  getDropdownI2IProviders,
  getImageDropdownProviders,
  getDropdownVideoProviders,
} from '../provider-catalog';
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

// ---------------------------------------------------------------------------
// getDropdownI2IProviders — catalog flag sync
// ---------------------------------------------------------------------------
describe('getDropdownI2IProviders', () => {
  const i2iCatalogEntries = IMAGE_PROVIDER_CATALOG.filter(p => p.showInI2IDropdown === true);

  it('always puts the auto entry first', () => {
    const result = getDropdownI2IProviders();
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].id).toBe('auto');
  });

  it('contains exactly one auto entry', () => {
    const result = getDropdownI2IProviders();
    const autoEntries = result.filter(p => p.id === 'auto');
    expect(autoEntries).toHaveLength(1);
  });

  it('includes every catalog entry marked showInI2IDropdown', () => {
    const result = getDropdownI2IProviders();
    const resultIds = result.map(p => p.id);
    for (const entry of i2iCatalogEntries) {
      expect(resultIds).toContain(entry.id);
    }
  });

  it('does not include providers not marked showInI2IDropdown (except auto)', () => {
    const flaggedIds = new Set(i2iCatalogEntries.map(p => p.id));
    const result = getDropdownI2IProviders();
    for (const item of result) {
      if (item.id === 'auto') continue;
      expect(flaggedIds.has(item.id)).toBe(true);
    }
  });

  it.each(i2iCatalogEntries.map(p => [p.id, p.name, p.description] as const))(
    'entry %s has correct name and description',
    (id, name, description) => {
      const result = getDropdownI2IProviders();
      const entry = result.find(p => p.id === id);
      expect(entry).toBeDefined();
      expect(entry!.name).toBe(name);
      expect(entry!.description).toBe(description);
    },
  );
});

// ---------------------------------------------------------------------------
// getImageDropdownProviders — catalog flag sync
// ---------------------------------------------------------------------------
describe('getImageDropdownProviders', () => {
  const imageDropdownEntries = IMAGE_PROVIDER_CATALOG.filter(p => p.showInImageDropdown === true);

  it('always puts the auto entry first', () => {
    const result = getImageDropdownProviders();
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].id).toBe('auto');
  });

  it('contains exactly one auto entry', () => {
    const result = getImageDropdownProviders();
    const autoEntries = result.filter(p => p.id === 'auto');
    expect(autoEntries).toHaveLength(1);
  });

  it('auto entry has supportsI2I and supportsStyle both true', () => {
    const result = getImageDropdownProviders();
    const auto = result.find(p => p.id === 'auto');
    expect(auto).toBeDefined();
    expect(auto!.supportsI2I).toBe(true);
    expect(auto!.supportsStyle).toBe(true);
  });

  it('includes every catalog entry marked showInImageDropdown', () => {
    const result = getImageDropdownProviders();
    const resultIds = result.map(p => p.id);
    for (const entry of imageDropdownEntries) {
      expect(resultIds).toContain(entry.id);
    }
  });

  it('does not include providers not marked showInImageDropdown (except auto)', () => {
    const flaggedIds = new Set(imageDropdownEntries.map(p => p.id));
    const result = getImageDropdownProviders();
    for (const item of result) {
      if (item.id === 'auto') continue;
      expect(flaggedIds.has(item.id)).toBe(true);
    }
  });

  it.each(
    imageDropdownEntries.map(p => [p.id, p.supportsI2I === true, p.supportsStyle === true] as const),
  )(
    'entry %s has correct supportsI2I=%s and supportsStyle=%s from catalog',
    (id, expectedI2I, expectedStyle) => {
      const result = getImageDropdownProviders();
      const entry = result.find(p => p.id === id);
      expect(entry).toBeDefined();
      expect(entry!.supportsI2I).toBe(expectedI2I);
      expect(entry!.supportsStyle).toBe(expectedStyle);
    },
  );

  it('every returned entry has a non-empty id, name, and description', () => {
    const result = getImageDropdownProviders();
    expect(result.length).toBeGreaterThan(0);
    for (const entry of result) {
      expect(entry.id.length).toBeGreaterThan(0);
      expect(entry.name.length).toBeGreaterThan(0);
      expect(entry.description.length).toBeGreaterThan(0);
    }
  });

  it('exposes supportsI2I and supportsStyle as booleans on every entry', () => {
    const result = getImageDropdownProviders();
    for (const entry of result) {
      expect(typeof entry.supportsI2I).toBe('boolean');
      expect(typeof entry.supportsStyle).toBe('boolean');
    }
  });
});

// ---------------------------------------------------------------------------
// getDropdownVideoProviders — catalog flag sync
// ---------------------------------------------------------------------------
describe('getDropdownVideoProviders', () => {
  const videoDropdownEntries = VIDEO_PROVIDER_CATALOG.filter(p => p.showInDropdown === true);

  it('always puts the auto entry first', () => {
    const result = getDropdownVideoProviders();
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].id).toBe('auto');
  });

  it('contains exactly one auto entry', () => {
    const result = getDropdownVideoProviders();
    const autoEntries = result.filter(p => p.id === 'auto');
    expect(autoEntries).toHaveLength(1);
  });

  it('includes every catalog entry marked showInDropdown', () => {
    const result = getDropdownVideoProviders();
    const resultIds = result.map(p => p.id);
    for (const entry of videoDropdownEntries) {
      expect(resultIds).toContain(entry.id);
    }
  });

  it('does not include providers not marked showInDropdown (except auto)', () => {
    const flaggedIds = new Set(videoDropdownEntries.map(p => p.id));
    const result = getDropdownVideoProviders();
    for (const item of result) {
      if (item.id === 'auto') continue;
      expect(flaggedIds.has(item.id)).toBe(true);
    }
  });

  it('every returned entry has a non-empty id, name, and description', () => {
    const result = getDropdownVideoProviders();
    expect(result.length).toBeGreaterThan(0);
    for (const entry of result) {
      expect(entry.id.length).toBeGreaterThan(0);
      expect(entry.name.length).toBeGreaterThan(0);
      expect(entry.description.length).toBeGreaterThan(0);
    }
  });

  it('mode=t2v excludes providers that only support i2v', () => {
    const t2vOnly = VIDEO_PROVIDER_CATALOG.filter(
      p => p.showInDropdown === true && !p.supportedModes.includes('t2v'),
    );
    const result = getDropdownVideoProviders('t2v');
    const resultIds = result.map(p => p.id);
    for (const entry of t2vOnly) {
      expect(resultIds).not.toContain(entry.id);
    }
  });

  it('mode=t2v includes all showInDropdown providers that support t2v', () => {
    const t2vEntries = VIDEO_PROVIDER_CATALOG.filter(
      p => p.showInDropdown === true && p.supportedModes.includes('t2v'),
    );
    const result = getDropdownVideoProviders('t2v');
    const resultIds = result.map(p => p.id);
    for (const entry of t2vEntries) {
      expect(resultIds).toContain(entry.id);
    }
  });

  it('mode=i2v excludes providers that only support t2v', () => {
    const i2vOnly = VIDEO_PROVIDER_CATALOG.filter(
      p => p.showInDropdown === true && !p.supportedModes.includes('i2v'),
    );
    const result = getDropdownVideoProviders('i2v');
    const resultIds = result.map(p => p.id);
    for (const entry of i2vOnly) {
      expect(resultIds).not.toContain(entry.id);
    }
  });

  it('mode=i2v includes all showInDropdown providers that support i2v', () => {
    const i2vEntries = VIDEO_PROVIDER_CATALOG.filter(
      p => p.showInDropdown === true && p.supportedModes.includes('i2v'),
    );
    const result = getDropdownVideoProviders('i2v');
    const resultIds = result.map(p => p.id);
    for (const entry of i2vEntries) {
      expect(resultIds).toContain(entry.id);
    }
  });

  it('mode=t2v still has auto as the first entry', () => {
    const result = getDropdownVideoProviders('t2v');
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].id).toBe('auto');
  });

  it('mode=i2v still has auto as the first entry', () => {
    const result = getDropdownVideoProviders('i2v');
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].id).toBe('auto');
  });

  it.each(videoDropdownEntries.map(p => [p.id, p.name, p.description] as const))(
    'entry %s has name and description matching the catalog',
    (id, name, description) => {
      const result = getDropdownVideoProviders();
      const entry = result.find(p => p.id === id);
      expect(entry).toBeDefined();
      expect(entry!.name).toBe(name);
      expect(entry!.description).toBe(description);
    },
  );
});
