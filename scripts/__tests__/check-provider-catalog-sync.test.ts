import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import path from 'path';
import { findCatalogSyncGaps, type CatalogEntry, type SyncCheckParams } from '../provider-catalog-sync-core';

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
    const scriptPath = path.resolve('scripts/check-provider-catalog-sync.ts');
    const result = spawnSync('npx', ['tsx', scriptPath], {
      encoding: 'utf8',
      env: { ...process.env, NODE_ENV: 'test' },
    });
    expect(
      result.stdout,
      `lint:providers reported gaps:\n${result.stderr}`,
    ).toContain('OK');
    expect(result.status).toBe(0);
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

// ── Script exit-code integration tests (subprocess) ──────────────────────────

describe('check-provider-catalog-sync script exit codes', () => {
  it('exits 1 and prints FAIL when the catalog and registry are out of sync', () => {
    // Write a tiny inline script that exercises the check with a deliberately
    // mismatched fixture and exits as the real script would.
    const inlineScript = `
import { findCatalogSyncGaps } from './scripts/provider-catalog-sync-core.js';
const gaps = findCatalogSyncGaps({
  videoCatalog: [{ id: 'orphan-vid', showInDropdown: true }],
  imageCatalog: [],
  sharedVideoProviders: {},
  sharedImageProviders: {},
  aiVideoProviders: {},
  providerTestIdMap: {},
  serverImageProviders: {},
});
if (gaps.length === 0) {
  process.exit(0);
} else {
  console.error('check-provider-catalog-sync: FAIL');
  process.exit(1);
}
`;
    const result = spawnSync(
      'npx',
      ['tsx', '--input-type=module', '--eval', inlineScript],
      { encoding: 'utf8', env: { ...process.env, NODE_ENV: 'test' } },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('FAIL');
  });

  it('exits 0 and prints OK for a fully-synced fixture', () => {
    const inlineScript = `
import { findCatalogSyncGaps } from './scripts/provider-catalog-sync-core.js';
const gaps = findCatalogSyncGaps({
  videoCatalog: [{ id: 'ok-vid', showInDropdown: true }],
  imageCatalog: [{ id: 'ok-img', showInDropdown: true }],
  sharedVideoProviders: { 'ok-vid': {} },
  sharedImageProviders: { 'ok-img': {} },
  aiVideoProviders: { 'ok-vid': {} },
  providerTestIdMap: { 'ok-vid': ['test-1'] },
  serverImageProviders: { 'ok-img': {} },
});
if (gaps.length === 0) {
  console.log('check-provider-catalog-sync: OK');
  process.exit(0);
} else {
  console.error('FAIL');
  process.exit(1);
}
`;
    const result = spawnSync(
      'npx',
      ['tsx', '--input-type=module', '--eval', inlineScript],
      { encoding: 'utf8', env: { ...process.env, NODE_ENV: 'test' } },
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('OK');
  });
});
