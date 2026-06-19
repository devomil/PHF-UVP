import { describe, it, expect } from 'vitest';
import {
  providerSupportsMultiImage,
  IMAGE_PROVIDER_CATALOG,
  VIDEO_PROVIDER_CATALOG,
  SFX_PROVIDER_CATALOG,
  getDropdownI2IProviders,
  getImageDropdownProviders,
  getDropdownVideoProviders,
  getDropdownV2VProviders,
  getDropdownSfxProviders,
} from '../provider-catalog';
import { getMultiImageSupport } from '../provider-config';

// Video providers that carry multiImageSupport in provider-config.ts
const MULTI_IMAGE_VIDEO_PROVIDERS = [
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

// Image providers that carry multiImageSupport in IMAGE_PROVIDERS
const MULTI_IMAGE_IMAGE_PROVIDERS = [
  'flux',
  'flux-1-dev',
  'falai',
  'midjourney',
];

// All multi-image providers combined (used in shared assertions)
const MULTI_IMAGE_PROVIDERS = [...MULTI_IMAGE_VIDEO_PROVIDERS, ...MULTI_IMAGE_IMAGE_PROVIDERS];

// Video providers (or pseudo-ids) that must NOT show the badge
const NON_MULTI_IMAGE_VIDEO_PROVIDERS = [
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

// Image providers that do NOT have multiImageSupport
const NON_MULTI_IMAGE_IMAGE_PROVIDERS = [
  'stability',
  'ideogram',
  'dalle3',
  'flux-kontext',
  'flux-1.1-pro',
];

// Combined list of all non-multi-image providers
const NON_MULTI_IMAGE_PROVIDERS = [
  ...NON_MULTI_IMAGE_VIDEO_PROVIDERS,
  ...NON_MULTI_IMAGE_IMAGE_PROVIDERS,
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
// providerSupportsMultiImage — image provider coverage
// ---------------------------------------------------------------------------
describe('providerSupportsMultiImage — image providers', () => {
  it.each(MULTI_IMAGE_IMAGE_PROVIDERS)(
    'returns true for image provider %s',
    (id) => {
      expect(providerSupportsMultiImage(id)).toBe(true);
    },
  );

  it.each(NON_MULTI_IMAGE_IMAGE_PROVIDERS)(
    'returns false for image provider %s',
    (id) => {
      expect(providerSupportsMultiImage(id)).toBe(false);
    },
  );

  it('flux returns true (IMAGE_PROVIDERS path)', () => {
    expect(providerSupportsMultiImage('flux')).toBe(true);
  });

  it('flux-1-dev returns true (IMAGE_PROVIDERS path)', () => {
    expect(providerSupportsMultiImage('flux-1-dev')).toBe(true);
  });

  it('falai returns true (IMAGE_PROVIDERS path)', () => {
    expect(providerSupportsMultiImage('falai')).toBe(true);
  });

  it('stability returns false — no multiImageSupport in IMAGE_PROVIDERS', () => {
    expect(providerSupportsMultiImage('stability')).toBe(false);
  });

  it('ideogram returns false — no multiImageSupport in IMAGE_PROVIDERS', () => {
    expect(providerSupportsMultiImage('ideogram')).toBe(false);
  });

  it('dalle3 returns false — no multiImageSupport in IMAGE_PROVIDERS', () => {
    expect(providerSupportsMultiImage('dalle3')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getMultiImageSupport — image provider hint strings and config
// ---------------------------------------------------------------------------
describe('getMultiImageSupport — image providers', () => {
  it('returns a config object for flux', () => {
    const support = getMultiImageSupport('flux');
    expect(support).not.toBeNull();
    expect(support!.maxImages).toBeGreaterThan(0);
    expect(typeof support!.hint).toBe('string');
    expect(support!.hint.length).toBeGreaterThan(0);
    expect(support!.promptSyntax).toBe('@imageN');
  });

  it('flux supports up to 4 reference images', () => {
    const support = getMultiImageSupport('flux');
    expect(support!.maxImages).toBe(4);
  });

  it('flux hint mentions @image1 or @imageN syntax', () => {
    const support = getMultiImageSupport('flux');
    expect(support!.hint).toMatch(/@image/);
  });

  it('returns a config object for flux-1-dev', () => {
    const support = getMultiImageSupport('flux-1-dev');
    expect(support).not.toBeNull();
    expect(support!.maxImages).toBeGreaterThan(0);
    expect(typeof support!.hint).toBe('string');
    expect(support!.hint.length).toBeGreaterThan(0);
    expect(support!.promptSyntax).toBe('@imageN');
  });

  it('flux-1-dev supports up to 4 reference images', () => {
    const support = getMultiImageSupport('flux-1-dev');
    expect(support!.maxImages).toBe(4);
  });

  it('flux-1-dev hint mentions @image syntax', () => {
    const support = getMultiImageSupport('flux-1-dev');
    expect(support!.hint).toMatch(/@image/);
  });

  it('returns a config object for falai', () => {
    const support = getMultiImageSupport('falai');
    expect(support).not.toBeNull();
    expect(support!.maxImages).toBeGreaterThan(0);
    expect(typeof support!.hint).toBe('string');
    expect(support!.hint.length).toBeGreaterThan(0);
    expect(support!.promptSyntax).toBe('@imageN');
  });

  it('falai supports up to 4 reference images', () => {
    const support = getMultiImageSupport('falai');
    expect(support!.maxImages).toBe(4);
  });

  it('falai hint mentions @image syntax', () => {
    const support = getMultiImageSupport('falai');
    expect(support!.hint).toMatch(/@image/);
  });

  it('returns null for stability — no multiImageSupport', () => {
    expect(getMultiImageSupport('stability')).toBeNull();
  });

  it('returns null for ideogram — no multiImageSupport', () => {
    expect(getMultiImageSupport('ideogram')).toBeNull();
  });

  it('returns null for dalle3 — no multiImageSupport', () => {
    expect(getMultiImageSupport('dalle3')).toBeNull();
  });

  it('flux and flux-1-dev share the same promptSyntax', () => {
    const fluxSupport = getMultiImageSupport('flux');
    const devSupport = getMultiImageSupport('flux-1-dev');
    expect(fluxSupport!.promptSyntax).toBe(devSupport!.promptSyntax);
  });

  it('image providers use @imageN promptSyntax (video providers may differ)', () => {
    const fluxSupport = getMultiImageSupport('flux');
    const fluxDevSupport = getMultiImageSupport('flux-1-dev');
    const falaiSupport = getMultiImageSupport('falai');
    expect(fluxSupport!.promptSyntax).toBe('@imageN');
    expect(fluxDevSupport!.promptSyntax).toBe('@imageN');
    expect(falaiSupport!.promptSyntax).toBe('@imageN');
  });

  it.each(MULTI_IMAGE_IMAGE_PROVIDERS)(
    'getMultiImageSupport returns non-null with valid shape for image provider %s',
    (id) => {
      const support = getMultiImageSupport(id);
      expect(support).not.toBeNull();
      expect(support!.maxImages).toBeGreaterThan(0);
      expect(typeof support!.promptSyntax).toBe('string');
      expect(support!.promptSyntax.length).toBeGreaterThan(0);
      expect(typeof support!.hint).toBe('string');
      expect(support!.hint.length).toBeGreaterThan(0);
    },
  );

  it.each(NON_MULTI_IMAGE_IMAGE_PROVIDERS)(
    'getMultiImageSupport returns null for non-supporting image provider %s',
    (id) => {
      expect(getMultiImageSupport(id)).toBeNull();
    },
  );
});

// ---------------------------------------------------------------------------
// providerSupportsMultiImage — VIDEO_PROVIDERS still return true
// ---------------------------------------------------------------------------
describe('providerSupportsMultiImage — VIDEO_PROVIDERS still return true', () => {
  it.each(MULTI_IMAGE_VIDEO_PROVIDERS)(
    'video provider %s still returns true',
    (id) => {
      expect(providerSupportsMultiImage(id)).toBe(true);
    },
  );

  it('kling returns true (VIDEO_PROVIDERS path)', () => {
    expect(providerSupportsMultiImage('kling')).toBe(true);
  });

  it('kling-2.6 returns true (VIDEO_PROVIDERS path)', () => {
    expect(providerSupportsMultiImage('kling-2.6')).toBe(true);
  });

  it('seedance-2.0 returns true (VIDEO_PROVIDERS path)', () => {
    expect(providerSupportsMultiImage('seedance-2.0')).toBe(true);
  });

  it('seedance-2.0-fast returns true (VIDEO_PROVIDERS path)', () => {
    expect(providerSupportsMultiImage('seedance-2.0-fast')).toBe(true);
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

  it.each(imageDropdownEntries.map(p => [p.id, p.name, p.description] as const))(
    'entry %s has name and description matching the catalog',
    (id, name, description) => {
      const result = getImageDropdownProviders();
      const entry = result.find(p => p.id === id);
      expect(entry).toBeDefined();
      expect(entry!.name).toBe(name);
      expect(entry!.description).toBe(description);
    },
  );
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

// ---------------------------------------------------------------------------
// getDropdownV2VProviders — catalog flag sync
// ---------------------------------------------------------------------------
describe('getDropdownV2VProviders', () => {
  const v2vCatalogEntries = VIDEO_PROVIDER_CATALOG.filter(p => p.showInV2VDropdown === true);

  it('always puts the auto entry first', () => {
    const result = getDropdownV2VProviders();
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].id).toBe('auto');
  });

  it('contains exactly one auto entry', () => {
    const result = getDropdownV2VProviders();
    const autoEntries = result.filter(p => p.id === 'auto');
    expect(autoEntries).toHaveLength(1);
  });

  it('includes every catalog entry marked showInV2VDropdown', () => {
    const result = getDropdownV2VProviders();
    const resultIds = result.map(p => p.id);
    for (const entry of v2vCatalogEntries) {
      expect(resultIds).toContain(entry.id);
    }
  });

  it('does not include providers not marked showInV2VDropdown (except auto)', () => {
    const flaggedIds = new Set(v2vCatalogEntries.map(p => p.id));
    const result = getDropdownV2VProviders();
    for (const item of result) {
      if (item.id === 'auto') continue;
      expect(flaggedIds.has(item.id)).toBe(true);
    }
  });

  it('every returned entry has a non-empty id, name, and description', () => {
    const result = getDropdownV2VProviders();
    expect(result.length).toBeGreaterThan(0);
    for (const entry of result) {
      expect(entry.id.length).toBeGreaterThan(0);
      expect(entry.name.length).toBeGreaterThan(0);
      expect(entry.description.length).toBeGreaterThan(0);
    }
  });

  it.each(v2vCatalogEntries.map(p => [p.id, p.name, p.description] as const))(
    'entry %s has name and description matching the catalog',
    (id, name, description) => {
      const result = getDropdownV2VProviders();
      const entry = result.find(p => p.id === id);
      expect(entry).toBeDefined();
      expect(entry!.name).toBe(name);
      expect(entry!.description).toBe(description);
    },
  );
});

// ---------------------------------------------------------------------------
// getDropdownSfxProviders — catalog flag sync
// ---------------------------------------------------------------------------
describe('getDropdownSfxProviders', () => {
  const sfxDropdownEntries = SFX_PROVIDER_CATALOG.filter(p => p.showInDropdown === true);

  it('returns at least one entry', () => {
    const result = getDropdownSfxProviders();
    expect(result.length).toBeGreaterThan(0);
  });

  it('includes every catalog entry marked showInDropdown', () => {
    const result = getDropdownSfxProviders();
    const resultIds = result.map(p => p.id);
    for (const entry of sfxDropdownEntries) {
      expect(resultIds).toContain(entry.id);
    }
  });

  it('does not include providers not marked showInDropdown', () => {
    const flaggedIds = new Set(sfxDropdownEntries.map(p => p.id));
    const result = getDropdownSfxProviders();
    for (const item of result) {
      expect(flaggedIds.has(item.id)).toBe(true);
    }
  });

  it('every returned entry has a non-empty id, name, and description', () => {
    const result = getDropdownSfxProviders();
    for (const entry of result) {
      expect(entry.id.length).toBeGreaterThan(0);
      expect(entry.name.length).toBeGreaterThan(0);
      expect(entry.description.length).toBeGreaterThan(0);
    }
  });

  it('each entry shape exposes exactly id, name, and description', () => {
    const result = getDropdownSfxProviders();
    for (const entry of result) {
      expect(Object.keys(entry).sort()).toStrictEqual(['description', 'id', 'name']);
    }
  });

  it.each(sfxDropdownEntries.map(p => [p.id, p.name, p.description] as const))(
    'entry %s has name and description matching the catalog',
    (id, name, description) => {
      const result = getDropdownSfxProviders();
      const entry = result.find(p => p.id === id);
      expect(entry).toBeDefined();
      expect(entry!.name).toBe(name);
      expect(entry!.description).toBe(description);
    },
  );
});
