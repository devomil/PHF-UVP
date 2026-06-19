import { describe, it, expect } from 'vitest';
import { findCatalogSyncGaps, type CatalogEntry, type SyncCheckParams } from '../provider-catalog-sync-core';
import { runCatalogSyncCheck } from '../check-provider-catalog-sync';
import { checkCostDrift, checkUnbaselinedProviders, type CostDriftParams, type UnbaselinedParams } from '../check-cost-drift-core';
import { checkSoundProviderCosts, type SoundProviderEntry } from '../check-sfx-cost-core';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeVideoEntry(id: string, overrides: Partial<CatalogEntry> = {}): CatalogEntry {
  return { id, ...overrides };
}

function makeImageEntry(id: string, overrides: Partial<CatalogEntry> = {}): CatalogEntry {
  return { id, ...overrides };
}

function baseParams(overrides: Partial<SyncCheckParams> = {}): SyncCheckParams {
  return {
    videoCatalog: [],
    imageCatalog: [],
    sharedVideoProviders: {},
    sharedImageProviders: {},
    aiVideoProviders: {},
    providerTestIdMap: {},
    serverImageProviders: {},
    ...overrides,
  };
}

// ── Real catalog: known-good integration test ─────────────────────────────────

describe('check-provider-catalog-sync script (real catalog)', () => {
  it('exits 0 with the current production catalog — no gaps', () => {
    const result = runCatalogSyncCheck();
    expect(
      result.output,
      `lint:providers reported gaps:\n${result.output}`,
    ).toContain('OK');
    expect(result.ok).toBe(true);
  });
});

// ── Unit tests: findCatalogSyncGaps with fixture data ────────────────────────

describe('findCatalogSyncGaps — known-good fixture (no gaps)', () => {
  it('returns an empty array when everything is fully in sync', () => {
    const params = baseParams({
      videoCatalog: [makeVideoEntry('prov-a', { showInDropdown: true })],
      sharedVideoProviders: { 'prov-a': {} },
      aiVideoProviders: { 'prov-a': {} },
      providerTestIdMap: { 'prov-a': ['test-id'] },
      imageCatalog: [makeImageEntry('img-a', { showInDropdown: true })],
      sharedImageProviders: { 'img-a': {} },
      serverImageProviders: { 'img-a': {} },
    });
    expect(findCatalogSyncGaps(params)).toHaveLength(0);
  });

  it('returns empty when catalog entries have no dropdown flags (hidden providers are exempt)', () => {
    const params = baseParams({
      videoCatalog: [makeVideoEntry('hidden-video')],
      sharedVideoProviders: {},
      imageCatalog: [makeImageEntry('hidden-image')],
      sharedImageProviders: {},
    });
    expect(findCatalogSyncGaps(params)).toHaveLength(0);
  });

  it('returns empty when showInDropdown is explicitly false', () => {
    const params = baseParams({
      videoCatalog: [makeVideoEntry('not-visible', { showInDropdown: false })],
      sharedVideoProviders: {},
    });
    expect(findCatalogSyncGaps(params)).toHaveLength(0);
  });
});

describe('findCatalogSyncGaps — catalog→registry gaps (direction 1)', () => {
  it('flags a video catalog entry with showInDropdown:true missing from sharedVideoProviders', () => {
    const params = baseParams({
      videoCatalog: [makeVideoEntry('missing-vid', { showInDropdown: true })],
      sharedVideoProviders: {},
    });
    const gaps = findCatalogSyncGaps(params);
    const gap = gaps.find(g => g.registry === 'shared/VIDEO_PROVIDERS' && g.id === 'missing-vid');
    expect(gap).toBeDefined();
    expect(gap).toMatchObject({
      id: 'missing-vid',
      catalog: 'VIDEO_PROVIDER_CATALOG',
      registry: 'shared/VIDEO_PROVIDERS',
      direction: 'catalog→registry',
    });
    expect(gap!.reason).toContain('showInDropdown');
  });

  it('flags a video catalog entry with showInV2VDropdown:true missing from sharedVideoProviders', () => {
    const params = baseParams({
      videoCatalog: [makeVideoEntry('missing-v2v', { showInV2VDropdown: true })],
      sharedVideoProviders: {},
    });
    const gaps = findCatalogSyncGaps(params);
    const gap = gaps.find(g => g.id === 'missing-v2v');
    expect(gap).toBeDefined();
    expect(gap!.direction).toBe('catalog→registry');
  });

  it('flags an image catalog entry with showInDropdown:true missing from sharedImageProviders', () => {
    const params = baseParams({
      imageCatalog: [makeImageEntry('missing-img', { showInDropdown: true })],
      sharedImageProviders: {},
    });
    const gaps = findCatalogSyncGaps(params);
    const gap = gaps.find(g => g.registry === 'shared/IMAGE_PROVIDERS' && g.id === 'missing-img');
    expect(gap).toBeDefined();
    expect(gap).toMatchObject({
      id: 'missing-img',
      catalog: 'IMAGE_PROVIDER_CATALOG',
      registry: 'shared/IMAGE_PROVIDERS',
      direction: 'catalog→registry',
    });
  });

  it('flags an image entry with showInImageDropdown:true missing from sharedImageProviders', () => {
    const params = baseParams({
      imageCatalog: [makeImageEntry('missing-i2d', { showInImageDropdown: true })],
      sharedImageProviders: {},
    });
    const gaps = findCatalogSyncGaps(params);
    const gap = gaps.find(g => g.id === 'missing-i2d');
    expect(gap).toBeDefined();
    expect(gap!.direction).toBe('catalog→registry');
  });

  it('flags an image entry with showInI2IDropdown:true missing from sharedImageProviders', () => {
    const params = baseParams({
      imageCatalog: [makeImageEntry('missing-i2i', { showInI2IDropdown: true })],
      sharedImageProviders: {},
    });
    const gaps = findCatalogSyncGaps(params);
    const gap = gaps.find(g => g.id === 'missing-i2i');
    expect(gap).toBeDefined();
    expect(gap!.direction).toBe('catalog→registry');
  });
});

describe('findCatalogSyncGaps — registry→catalog gaps (direction 2)', () => {
  it('flags a sharedVideoProviders entry with no catalog entry', () => {
    const params = baseParams({
      videoCatalog: [],
      sharedVideoProviders: { 'orphan-vid': {} },
    });
    const gaps = findCatalogSyncGaps(params);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({
      id: 'orphan-vid',
      catalog: 'VIDEO_PROVIDER_CATALOG',
      registry: 'shared/VIDEO_PROVIDERS',
      direction: 'registry→catalog',
      reason: 'present in registry but has no catalog entry',
    });
  });

  it('flags a sharedImageProviders entry with no catalog entry', () => {
    const params = baseParams({
      imageCatalog: [],
      sharedImageProviders: { 'orphan-img': {} },
    });
    const gaps = findCatalogSyncGaps(params);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({
      id: 'orphan-img',
      catalog: 'IMAGE_PROVIDER_CATALOG',
      registry: 'shared/IMAGE_PROVIDERS',
      direction: 'registry→catalog',
    });
  });

  it('does not flag a registry entry that has a matching (non-dropdown) catalog entry', () => {
    const params = baseParams({
      videoCatalog: [makeVideoEntry('internal-prov')],
      sharedVideoProviders: { 'internal-prov': {} },
    });
    expect(findCatalogSyncGaps(params)).toHaveLength(0);
  });
});

describe('findCatalogSyncGaps — catalog→server AI_VIDEO_PROVIDERS gap (direction 3)', () => {
  it('flags showInDropdown:true video entry missing from aiVideoProviders', () => {
    const params = baseParams({
      videoCatalog: [makeVideoEntry('vid-no-server', { showInDropdown: true })],
      sharedVideoProviders: { 'vid-no-server': {} },
      aiVideoProviders: {},
    });
    const gaps = findCatalogSyncGaps(params);
    const gap = gaps.find(g => g.registry === 'server/AI_VIDEO_PROVIDERS');
    expect(gap).toBeDefined();
    expect(gap!.id).toBe('vid-no-server');
    expect(gap!.reason).toContain('AI_VIDEO_PROVIDERS');
  });

  it('does not flag entry that is NOT showInDropdown even if missing from aiVideoProviders', () => {
    const params = baseParams({
      videoCatalog: [makeVideoEntry('hidden-server', { showInDropdown: false })],
      sharedVideoProviders: { 'hidden-server': {} },
      aiVideoProviders: {},
    });
    const gaps = findCatalogSyncGaps(params);
    expect(gaps.find(g => g.registry === 'server/AI_VIDEO_PROVIDERS')).toBeUndefined();
  });
});

describe('findCatalogSyncGaps — catalog→PROVIDER_TEST_ID_MAP gap (direction 4a)', () => {
  it('flags showInDropdown:true video entry in aiVideoProviders but missing from providerTestIdMap', () => {
    const params = baseParams({
      videoCatalog: [makeVideoEntry('vid-no-testmap', { showInDropdown: true })],
      sharedVideoProviders: { 'vid-no-testmap': {} },
      aiVideoProviders: { 'vid-no-testmap': {} },
      providerTestIdMap: {},
    });
    const gaps = findCatalogSyncGaps(params);
    const gap = gaps.find(g => g.registry === 'server/PROVIDER_TEST_ID_MAP');
    expect(gap).toBeDefined();
    expect(gap!.id).toBe('vid-no-testmap');
    expect(gap!.reason).toContain('PROVIDER_TEST_ID_MAP');
  });

  it('does not flag entry missing from aiVideoProviders (already caught by direction 3)', () => {
    const params = baseParams({
      videoCatalog: [makeVideoEntry('vid-no-ai', { showInDropdown: true })],
      sharedVideoProviders: { 'vid-no-ai': {} },
      aiVideoProviders: {},
      providerTestIdMap: {},
    });
    const gaps = findCatalogSyncGaps(params);
    expect(gaps.find(g => g.registry === 'server/PROVIDER_TEST_ID_MAP')).toBeUndefined();
  });
});

describe('findCatalogSyncGaps — catalog→serverImageProviders gap (direction 4b)', () => {
  it('flags showInDropdown:true image entry missing from serverImageProviders', () => {
    const params = baseParams({
      imageCatalog: [makeImageEntry('img-no-server', { showInDropdown: true })],
      sharedImageProviders: { 'img-no-server': {} },
      serverImageProviders: {},
    });
    const gaps = findCatalogSyncGaps(params);
    const gap = gaps.find(g => g.registry === 'server/IMAGE_PROVIDERS');
    expect(gap).toBeDefined();
    expect(gap!.id).toBe('img-no-server');
    expect(gap!.reason).toContain('server/config/image-providers.ts');
  });

  it('flags showInImageDropdown:true entry missing from serverImageProviders', () => {
    const params = baseParams({
      imageCatalog: [makeImageEntry('img-i-no-server', { showInImageDropdown: true })],
      sharedImageProviders: { 'img-i-no-server': {} },
      serverImageProviders: {},
    });
    const gaps = findCatalogSyncGaps(params);
    expect(gaps.find(g => g.registry === 'server/IMAGE_PROVIDERS' && g.id === 'img-i-no-server')).toBeDefined();
  });

  it('flags showInI2IDropdown:true entry missing from serverImageProviders', () => {
    const params = baseParams({
      imageCatalog: [makeImageEntry('img-i2i-no-server', { showInI2IDropdown: true })],
      sharedImageProviders: { 'img-i2i-no-server': {} },
      serverImageProviders: {},
    });
    const gaps = findCatalogSyncGaps(params);
    expect(gaps.find(g => g.registry === 'server/IMAGE_PROVIDERS' && g.id === 'img-i2i-no-server')).toBeDefined();
  });
});

describe('findCatalogSyncGaps — multiple gaps accumulate', () => {
  it('reports all gaps simultaneously, not just the first one', () => {
    const params = baseParams({
      videoCatalog: [
        makeVideoEntry('vid-a', { showInDropdown: true }),
        makeVideoEntry('vid-b', { showInDropdown: true }),
      ],
      sharedVideoProviders: {},
    });
    const gaps = findCatalogSyncGaps(params);
    const ids = gaps.map(g => g.id);
    expect(ids).toContain('vid-a');
    expect(ids).toContain('vid-b');
  });

  it('accumulates gaps from all four check directions in one pass', () => {
    const params = baseParams({
      videoCatalog: [makeVideoEntry('vid-x', { showInDropdown: true })],
      sharedVideoProviders: {},
      aiVideoProviders: {},
      providerTestIdMap: {},
      imageCatalog: [],
      sharedImageProviders: { 'orphan-registry': {} },
    });
    const gaps = findCatalogSyncGaps(params);
    expect(gaps.length).toBeGreaterThanOrEqual(2);
    expect(gaps.some(g => g.id === 'vid-x')).toBe(true);
    expect(gaps.some(g => g.id === 'orphan-registry')).toBe(true);
  });
});

// ── checkCostDrift unit tests ─────────────────────────────────────────────────

function baseDriftParams(overrides: Partial<CostDriftParams> = {}): CostDriftParams {
  return {
    videoProviders: {},
    imageProviders: {},
    soundProviders: {},
    videoBaseline: {},
    imageBaseline: {},
    soundBaseline: {},
    tolerancePct: 50,
    ...overrides,
  };
}

describe('checkCostDrift — no drift (all within tolerance)', () => {
  it('returns empty array when providers match the baseline exactly', () => {
    const params = baseDriftParams({
      videoProviders: { runway: { costPerSecond: 0.05 } },
      videoBaseline:  { runway: { costPerSecond: 0.05 } },
    });
    expect(checkCostDrift(params)).toHaveLength(0);
  });

  it('returns empty array when drift is exactly at the tolerance boundary', () => {
    // 50% tolerance, baseline 0.05 → current 0.075 is exactly +50% → still ok
    const params = baseDriftParams({
      videoProviders: { runway: { costPerSecond: 0.075 } },
      videoBaseline:  { runway: { costPerSecond: 0.05 } },
    });
    expect(checkCostDrift(params)).toHaveLength(0);
  });

  it('returns empty array when a provider is new (not in baseline)', () => {
    // New providers are not flagged — they simply have no baseline entry.
    const params = baseDriftParams({
      videoProviders: { 'brand-new': { costPerSecond: 0.99 } },
      videoBaseline:  {},
    });
    expect(checkCostDrift(params)).toHaveLength(0);
  });

  it('returns empty array when a baseline provider is removed from the registry', () => {
    // Removed providers are handled by the zero/missing cost check, not drift.
    const params = baseDriftParams({
      videoProviders: {},
      videoBaseline:  { runway: { costPerSecond: 0.05 } },
    });
    expect(checkCostDrift(params)).toHaveLength(0);
  });
});

describe('checkCostDrift — drift detected', () => {
  it('flags a costPerSecond that increased by more than the tolerance', () => {
    // 0.05 → 0.5 is 900% drift, well over 50%
    const params = baseDriftParams({
      videoProviders: { runway: { costPerSecond: 0.5 } },
      videoBaseline:  { runway: { costPerSecond: 0.05 } },
    });
    const errors = checkCostDrift(params);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      registry: 'shared/VIDEO_PROVIDERS',
      id: 'runway',
      field: 'costPerSecond',
      baseline: 0.05,
      current: 0.5,
    });
    expect(errors[0].driftPct).toBeCloseTo(900, 0);
  });

  it('flags a costPerSecond that decreased by more than the tolerance', () => {
    // 0.05 → 0.01 is 80% decrease, over 50%
    const params = baseDriftParams({
      videoProviders: { runway: { costPerSecond: 0.01 } },
      videoBaseline:  { runway: { costPerSecond: 0.05 } },
    });
    const errors = checkCostDrift(params);
    expect(errors).toHaveLength(1);
    expect(errors[0].driftPct).toBeCloseTo(80, 0);
  });

  it('flags a costPerImage drift in the image registry', () => {
    const params = baseDriftParams({
      imageProviders: { flux: { costPerImage: 0.30 } },
      imageBaseline:  { flux: { costPerImage: 0.03 } },
    });
    const errors = checkCostDrift(params);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      registry: 'shared/IMAGE_PROVIDERS',
      id: 'flux',
      field: 'costPerImage',
    });
  });

  it('flags a costPerTrack drift in the sound registry', () => {
    const params = baseDriftParams({
      soundProviders: { udio: { costPerTrack: 1.00 } },
      soundBaseline:  { udio: { costPerTrack: 0.10 } },
    });
    const errors = checkCostDrift(params);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      registry: 'shared/SOUND_PROVIDERS',
      id: 'udio',
      field: 'costPerTrack',
    });
  });

  it('flags a costPerEffect drift in the sound registry', () => {
    const params = baseDriftParams({
      soundProviders: { elevenlabs_sfx: { costPerEffect: 0.20 } },
      soundBaseline:  { elevenlabs_sfx: { costPerEffect: 0.02 } },
    });
    const errors = checkCostDrift(params);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      registry: 'shared/SOUND_PROVIDERS',
      id: 'elevenlabs_sfx',
      field: 'costPerEffect',
    });
  });

  it('accumulates errors across multiple drifted providers', () => {
    const params = baseDriftParams({
      videoProviders: {
        runway: { costPerSecond: 0.5 },
        kling:  { costPerSecond: 0.3 },
      },
      videoBaseline: {
        runway: { costPerSecond: 0.05 },
        kling:  { costPerSecond: 0.03 },
      },
    });
    const errors = checkCostDrift(params);
    expect(errors).toHaveLength(2);
    const ids = errors.map(e => e.id);
    expect(ids).toContain('runway');
    expect(ids).toContain('kling');
  });

  it('respects a custom tolerancePct', () => {
    // With a strict 10% tolerance, even a 20% increase should be flagged
    const params = baseDriftParams({
      videoProviders: { runway: { costPerSecond: 0.06 } },
      videoBaseline:  { runway: { costPerSecond: 0.05 } },
      tolerancePct: 10,
    });
    const errors = checkCostDrift(params);
    expect(errors).toHaveLength(1);
    expect(errors[0].driftPct).toBeCloseTo(20, 0);
  });

  it('does not flag a value that has drifted but the live cost field is missing (zero/missing check handles that)', () => {
    // If the live entry exists but has no cost field at all, drift check skips it
    const params = baseDriftParams({
      videoProviders: { runway: {} },
      videoBaseline:  { runway: { costPerSecond: 0.05 } },
    });
    expect(checkCostDrift(params)).toHaveLength(0);
  });
});

// ── checkUnbaselinedProviders unit tests ──────────────────────────────────────

function baseUnbaselinedParams(overrides: Partial<UnbaselinedParams> = {}): UnbaselinedParams {
  return {
    videoProviders: {},
    imageProviders: {},
    soundProviders: {},
    videoBaseline: {},
    imageBaseline: {},
    soundBaseline: {},
    ...overrides,
  };
}

describe('checkUnbaselinedProviders — no unbaselined providers', () => {
  it('returns empty array when all video providers are in the baseline', () => {
    const params = baseUnbaselinedParams({
      videoProviders: { runway: { costPerSecond: 0.05 } },
      videoBaseline:  { runway: { costPerSecond: 0.05 } },
    });
    expect(checkUnbaselinedProviders(params)).toHaveLength(0);
  });

  it('returns empty array when all image providers are in the baseline', () => {
    const params = baseUnbaselinedParams({
      imageProviders: { flux: { costPerImage: 0.03 } },
      imageBaseline:  { flux: { costPerImage: 0.03 } },
    });
    expect(checkUnbaselinedProviders(params)).toHaveLength(0);
  });

  it('returns empty array when all sound providers are in the baseline', () => {
    const params = baseUnbaselinedParams({
      soundProviders: { elevenlabs: { costPerSecond: 0.015 } },
      soundBaseline:  { elevenlabs: { costPerSecond: 0.015 } },
    });
    expect(checkUnbaselinedProviders(params)).toHaveLength(0);
  });

  it('returns empty array when registries and baselines are all empty', () => {
    expect(checkUnbaselinedProviders(baseUnbaselinedParams())).toHaveLength(0);
  });

  it('does not flag a baseline provider that was removed from the registry', () => {
    const params = baseUnbaselinedParams({
      videoProviders: {},
      videoBaseline:  { runway: { costPerSecond: 0.05 } },
    });
    expect(checkUnbaselinedProviders(params)).toHaveLength(0);
  });
});

describe('checkUnbaselinedProviders — new provider flagged', () => {
  it('flags a video provider that has no baseline entry', () => {
    const params = baseUnbaselinedParams({
      videoProviders: { 'brand-new-vid': { costPerSecond: 0.99 } },
      videoBaseline:  {},
    });
    const errors = checkUnbaselinedProviders(params);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      registry: 'shared/VIDEO_PROVIDERS',
      id: 'brand-new-vid',
    });
  });

  it('flags a new image provider missing from the baseline', () => {
    const params = baseUnbaselinedParams({
      imageProviders: { 'new-image-prov': { costPerImage: 0.05 } },
      imageBaseline:  {},
    });
    const errors = checkUnbaselinedProviders(params);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      registry: 'shared/IMAGE_PROVIDERS',
      id: 'new-image-prov',
    });
  });

  it('flags a new sound provider missing from the baseline', () => {
    const params = baseUnbaselinedParams({
      soundProviders: { 'new-sfx': { costPerEffect: 0.03 } },
      soundBaseline:  {},
    });
    const errors = checkUnbaselinedProviders(params);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      registry: 'shared/SOUND_PROVIDERS',
      id: 'new-sfx',
    });
  });

  it('flags multiple new providers across different registries', () => {
    const params = baseUnbaselinedParams({
      videoProviders: { 'new-vid-a': { costPerSecond: 0.04 }, 'new-vid-b': { costPerSecond: 0.06 } },
      videoBaseline:  {},
      imageProviders: { 'new-img': { costPerImage: 0.02 } },
      imageBaseline:  {},
    });
    const errors = checkUnbaselinedProviders(params);
    expect(errors).toHaveLength(3);
    const ids = errors.map(e => e.id);
    expect(ids).toContain('new-vid-a');
    expect(ids).toContain('new-vid-b');
    expect(ids).toContain('new-img');
  });

  it('does not flag existing providers when a new one is added alongside them', () => {
    const params = baseUnbaselinedParams({
      videoProviders: {
        runway: { costPerSecond: 0.05 },
        'new-provider': { costPerSecond: 0.07 },
      },
      videoBaseline: { runway: { costPerSecond: 0.05 } },
    });
    const errors = checkUnbaselinedProviders(params);
    expect(errors).toHaveLength(1);
    expect(errors[0].id).toBe('new-provider');
    expect(errors[0].registry).toBe('shared/VIDEO_PROVIDERS');
  });
});

// ── checkSoundProviderCosts unit tests ────────────────────────────────────────

function makeSound(id: string, type: string, costFields: Record<string, unknown> = {}): Record<string, SoundProviderEntry> {
  return { [id]: { type, ...costFields } as SoundProviderEntry };
}

describe('checkSoundProviderCosts — valid positive values (no errors)', () => {
  it('accepts a voiceover provider with a positive costPerSecond', () => {
    const errors = checkSoundProviderCosts(makeSound('el-voice', 'voiceover', { costPerSecond: 0.05 }));
    expect(errors).toHaveLength(0);
  });

  it('accepts a music provider with a positive costPerTrack', () => {
    const errors = checkSoundProviderCosts(makeSound('udio', 'music', { costPerTrack: 0.10 }));
    expect(errors).toHaveLength(0);
  });

  it('accepts an sfx provider with a positive costPerEffect', () => {
    const errors = checkSoundProviderCosts(makeSound('el-sfx', 'sfx', { costPerEffect: 0.02 }));
    expect(errors).toHaveLength(0);
  });

  it('skips entries with an unknown type without emitting an error', () => {
    const errors = checkSoundProviderCosts(makeSound('mystery', 'ambient'));
    expect(errors).toHaveLength(0);
  });

  it('returns an empty array for an empty registry', () => {
    expect(checkSoundProviderCosts({})).toHaveLength(0);
  });
});

describe('checkSoundProviderCosts — missing cost field', () => {
  it('flags a voiceover provider with no costPerSecond field', () => {
    const errors = checkSoundProviderCosts(makeSound('el-voice', 'voiceover'));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      registry: 'shared/SOUND_PROVIDERS',
      id: 'el-voice',
      field: 'costPerSecond',
    });
    expect(errors[0].reason).toContain('missing or not a number');
  });

  it('flags a music provider with no costPerTrack field', () => {
    const errors = checkSoundProviderCosts(makeSound('udio', 'music'));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      id: 'udio',
      field: 'costPerTrack',
    });
    expect(errors[0].reason).toContain('missing or not a number');
  });

  it('flags an sfx provider with no costPerEffect field', () => {
    const errors = checkSoundProviderCosts(makeSound('el-sfx', 'sfx'));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      id: 'el-sfx',
      field: 'costPerEffect',
    });
    expect(errors[0].reason).toContain('missing or not a number');
  });
});

describe('checkSoundProviderCosts — zero cost field', () => {
  it('flags a voiceover provider with costPerSecond === 0', () => {
    const errors = checkSoundProviderCosts(makeSound('el-voice', 'voiceover', { costPerSecond: 0 }));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ id: 'el-voice', field: 'costPerSecond' });
    expect(errors[0].reason).toContain('must be > 0');
  });

  it('flags a music provider with costPerTrack === 0', () => {
    const errors = checkSoundProviderCosts(makeSound('udio', 'music', { costPerTrack: 0 }));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ id: 'udio', field: 'costPerTrack' });
    expect(errors[0].reason).toContain('must be > 0');
  });

  it('flags an sfx provider with costPerEffect === 0', () => {
    const errors = checkSoundProviderCosts(makeSound('el-sfx', 'sfx', { costPerEffect: 0 }));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ id: 'el-sfx', field: 'costPerEffect' });
    expect(errors[0].reason).toContain('must be > 0');
  });
});

describe('checkSoundProviderCosts — negative cost field', () => {
  it('flags a voiceover provider with a negative costPerSecond', () => {
    const errors = checkSoundProviderCosts(makeSound('el-voice', 'voiceover', { costPerSecond: -0.05 }));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ id: 'el-voice', field: 'costPerSecond' });
    expect(errors[0].reason).toContain('must be > 0');
  });

  it('flags a music provider with a negative costPerTrack', () => {
    const errors = checkSoundProviderCosts(makeSound('udio', 'music', { costPerTrack: -1 }));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ id: 'udio', field: 'costPerTrack' });
    expect(errors[0].reason).toContain('must be > 0');
  });

  it('flags an sfx provider with a negative costPerEffect', () => {
    const errors = checkSoundProviderCosts(makeSound('el-sfx', 'sfx', { costPerEffect: -0.01 }));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ id: 'el-sfx', field: 'costPerEffect' });
    expect(errors[0].reason).toContain('must be > 0');
  });
});

describe('checkSoundProviderCosts — non-numeric cost field', () => {
  it('flags a voiceover provider with a string costPerSecond', () => {
    const errors = checkSoundProviderCosts(makeSound('el-voice', 'voiceover', { costPerSecond: '0.05' }));
    expect(errors).toHaveLength(1);
    expect(errors[0].reason).toContain('missing or not a number');
  });

  it('flags an sfx provider with NaN costPerEffect', () => {
    const errors = checkSoundProviderCosts(makeSound('el-sfx', 'sfx', { costPerEffect: NaN }));
    expect(errors).toHaveLength(1);
    expect(errors[0].reason).toContain('missing or not a number');
  });
});

describe('checkSoundProviderCosts — accumulates errors across multiple providers', () => {
  it('collects all errors in a single pass across different types', () => {
    const providers: Record<string, SoundProviderEntry> = {
      'voice-bad':  { type: 'voiceover' },
      'music-bad':  { type: 'music', costPerTrack: 0 },
      'sfx-bad':    { type: 'sfx', costPerEffect: -0.5 },
      'voice-good': { type: 'voiceover', costPerSecond: 0.05 },
    };
    const errors = checkSoundProviderCosts(providers);
    expect(errors).toHaveLength(3);
    const ids = errors.map(e => e.id);
    expect(ids).toContain('voice-bad');
    expect(ids).toContain('music-bad');
    expect(ids).toContain('sfx-bad');
    expect(ids).not.toContain('voice-good');
  });
});

describe('checkSoundProviderCosts — real SOUND_PROVIDERS registry (integration)', () => {
  it('finds no cost errors in the current production SOUND_PROVIDERS', async () => {
    const { SOUND_PROVIDERS } = await import('../../shared/provider-config');
    const errors = checkSoundProviderCosts(SOUND_PROVIDERS as Record<string, SoundProviderEntry>);
    expect(
      errors,
      `SOUND_PROVIDERS has missing/zero cost fields:\n${errors.map(e => `  ${e.registry}["${e.id}"].${e.field}: ${e.reason}`).join('\n')}`,
    ).toHaveLength(0);
  });
});

describe('checkCostDrift — real production registry against baseline (integration)', () => {
  it('exits 0 with current production costs — no drift vs committed baseline', () => {
    const result = runCatalogSyncCheck();
    expect(
      result.output,
      `lint:providers reported issues:\n${result.output}`,
    ).toContain('OK');
    expect(result.ok).toBe(true);
  });
});

// ── Sync gap logic exit-code equivalents (direct, no subprocess) ──────────────

describe('check-provider-catalog-sync gap logic — exit-code equivalents', () => {
  it('reports gaps when the catalog and registry are out of sync', () => {
    const gaps = findCatalogSyncGaps({
      videoCatalog: [{ id: 'orphan-vid', showInDropdown: true }],
      imageCatalog: [],
      sharedVideoProviders: {},
      sharedImageProviders: {},
      aiVideoProviders: {},
      providerTestIdMap: {},
      serverImageProviders: {},
    });
    expect(gaps.length).toBeGreaterThan(0);
    expect(gaps.some(g => g.id === 'orphan-vid')).toBe(true);
  });

  it('reports no gaps for a fully-synced fixture', () => {
    const gaps = findCatalogSyncGaps({
      videoCatalog: [{ id: 'ok-vid', showInDropdown: true }],
      imageCatalog: [{ id: 'ok-img', showInDropdown: true }],
      sharedVideoProviders: { 'ok-vid': {} },
      sharedImageProviders: { 'ok-img': {} },
      aiVideoProviders: { 'ok-vid': {} },
      providerTestIdMap: { 'ok-vid': ['test-1'] },
      serverImageProviders: { 'ok-img': {} },
    });
    expect(gaps).toHaveLength(0);
  });
});
