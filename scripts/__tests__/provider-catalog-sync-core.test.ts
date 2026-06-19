import { describe, it, expect } from 'vitest';
import { findCatalogSyncGaps, type SyncCheckParams } from '../provider-catalog-sync-core';

function makeParams(overrides: Partial<SyncCheckParams> = {}): SyncCheckParams {
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

describe('findCatalogSyncGaps', () => {
  it('returns no gaps when everything is perfectly in sync', () => {
    const params = makeParams({
      videoCatalog: [
        { id: 'kling', showInDropdown: true },
        { id: 'runway', showInV2VDropdown: true },
        { id: 'hidden-video', showInDropdown: false },
      ],
      imageCatalog: [
        { id: 'flux', showInDropdown: true },
        { id: 'recraft', showInImageDropdown: true },
        { id: 'hidden-image' },
      ],
      sharedVideoProviders: { kling: {}, runway: {}, 'hidden-video': {} },
      sharedImageProviders: { flux: {}, recraft: {}, 'hidden-image': {} },
      aiVideoProviders: { kling: {}, runway: {} },
      providerTestIdMap: { kling: 'test-kling', runway: 'test-runway' },
      serverImageProviders: { flux: {}, recraft: {} },
    });

    expect(findCatalogSyncGaps(params)).toEqual([]);
  });

  describe('gap direction 1: catalog entry with showInDropdown but missing from shared registry', () => {
    it('catches a video catalog entry visible in dropdown but absent from sharedVideoProviders', () => {
      const params = makeParams({
        videoCatalog: [{ id: 'ghost-video', showInDropdown: true }],
        sharedVideoProviders: {},
        aiVideoProviders: { 'ghost-video': {} },
        providerTestIdMap: { 'ghost-video': 'test-id' },
      });

      const gaps = findCatalogSyncGaps(params);
      const match = gaps.find(
        g =>
          g.id === 'ghost-video' &&
          g.direction === 'catalog→registry' &&
          g.registry === 'shared/VIDEO_PROVIDERS',
      );
      expect(match).toBeDefined();
    });

    it('catches a video catalog entry visible via showInV2VDropdown but absent from sharedVideoProviders', () => {
      const params = makeParams({
        videoCatalog: [{ id: 'v2v-provider', showInV2VDropdown: true }],
        sharedVideoProviders: {},
      });

      const gaps = findCatalogSyncGaps(params);
      const match = gaps.find(
        g =>
          g.id === 'v2v-provider' &&
          g.direction === 'catalog→registry' &&
          g.registry === 'shared/VIDEO_PROVIDERS',
      );
      expect(match).toBeDefined();
    });

    it('catches an image catalog entry visible in dropdown but absent from sharedImageProviders', () => {
      const params = makeParams({
        imageCatalog: [{ id: 'ghost-image', showInDropdown: true }],
        sharedImageProviders: {},
        serverImageProviders: { 'ghost-image': {} },
      });

      const gaps = findCatalogSyncGaps(params);
      const match = gaps.find(
        g =>
          g.id === 'ghost-image' &&
          g.direction === 'catalog→registry' &&
          g.registry === 'shared/IMAGE_PROVIDERS',
      );
      expect(match).toBeDefined();
    });

    it('catches an image catalog entry visible via showInI2IDropdown but absent from sharedImageProviders', () => {
      const params = makeParams({
        imageCatalog: [{ id: 'i2i-image', showInI2IDropdown: true }],
        sharedImageProviders: {},
        serverImageProviders: { 'i2i-image': {} },
      });

      const gaps = findCatalogSyncGaps(params);
      const match = gaps.find(
        g =>
          g.id === 'i2i-image' &&
          g.direction === 'catalog→registry' &&
          g.registry === 'shared/IMAGE_PROVIDERS',
      );
      expect(match).toBeDefined();
    });

    it('does NOT flag a catalog entry that is not visible in any dropdown', () => {
      const params = makeParams({
        videoCatalog: [{ id: 'internal-only', showInDropdown: false }],
        sharedVideoProviders: {},
      });

      const gaps = findCatalogSyncGaps(params);
      expect(gaps.filter(g => g.id === 'internal-only')).toHaveLength(0);
    });
  });

  describe('gap direction 2: registry entry with no catalog entry', () => {
    it('catches a sharedVideoProviders entry that has no matching video catalog entry', () => {
      const params = makeParams({
        videoCatalog: [],
        sharedVideoProviders: { 'orphan-video': {} },
      });

      const gaps = findCatalogSyncGaps(params);
      const match = gaps.find(
        g =>
          g.id === 'orphan-video' &&
          g.direction === 'registry→catalog' &&
          g.registry === 'shared/VIDEO_PROVIDERS',
      );
      expect(match).toBeDefined();
    });

    it('catches a sharedImageProviders entry that has no matching image catalog entry', () => {
      const params = makeParams({
        imageCatalog: [],
        sharedImageProviders: { 'orphan-image': {} },
      });

      const gaps = findCatalogSyncGaps(params);
      const match = gaps.find(
        g =>
          g.id === 'orphan-image' &&
          g.direction === 'registry→catalog' &&
          g.registry === 'shared/IMAGE_PROVIDERS',
      );
      expect(match).toBeDefined();
    });

    it('does NOT flag a registry entry that has a corresponding catalog entry', () => {
      const params = makeParams({
        videoCatalog: [{ id: 'synced-video' }],
        sharedVideoProviders: { 'synced-video': {} },
      });

      const gaps = findCatalogSyncGaps(params);
      expect(gaps.filter(g => g.id === 'synced-video')).toHaveLength(0);
    });
  });

  describe('gap direction 3: showInDropdown video provider missing from AI_VIDEO_PROVIDERS', () => {
    it('catches a video catalog entry with showInDropdown:true missing from aiVideoProviders', () => {
      const params = makeParams({
        videoCatalog: [{ id: 'missing-from-server', showInDropdown: true }],
        sharedVideoProviders: { 'missing-from-server': {} },
        aiVideoProviders: {},
        providerTestIdMap: {},
      });

      const gaps = findCatalogSyncGaps(params);
      const match = gaps.find(
        g =>
          g.id === 'missing-from-server' &&
          g.direction === 'catalog→registry' &&
          g.registry === 'server/AI_VIDEO_PROVIDERS',
      );
      expect(match).toBeDefined();
    });

    it('does NOT flag a video entry with showInDropdown:false for aiVideoProviders', () => {
      const params = makeParams({
        videoCatalog: [{ id: 'internal-video', showInDropdown: false }],
        sharedVideoProviders: { 'internal-video': {} },
        aiVideoProviders: {},
      });

      const gaps = findCatalogSyncGaps(params);
      expect(
        gaps.filter(g => g.id === 'internal-video' && g.registry === 'server/AI_VIDEO_PROVIDERS'),
      ).toHaveLength(0);
    });

    it('does NOT flag a video entry only visible via showInV2VDropdown (not showInDropdown) for aiVideoProviders', () => {
      const params = makeParams({
        videoCatalog: [{ id: 'v2v-only', showInV2VDropdown: true }],
        sharedVideoProviders: { 'v2v-only': {} },
        aiVideoProviders: {},
      });

      const gaps = findCatalogSyncGaps(params);
      expect(
        gaps.filter(g => g.id === 'v2v-only' && g.registry === 'server/AI_VIDEO_PROVIDERS'),
      ).toHaveLength(0);
    });
  });

  describe('gap 4a: showInDropdown video provider in AI_VIDEO_PROVIDERS but missing from PROVIDER_TEST_ID_MAP', () => {
    it('catches a provider present in aiVideoProviders but absent from providerTestIdMap', () => {
      const params = makeParams({
        videoCatalog: [{ id: 'no-test-id', showInDropdown: true }],
        sharedVideoProviders: { 'no-test-id': {} },
        aiVideoProviders: { 'no-test-id': {} },
        providerTestIdMap: {},
      });

      const gaps = findCatalogSyncGaps(params);
      const match = gaps.find(
        g =>
          g.id === 'no-test-id' &&
          g.direction === 'catalog→registry' &&
          g.registry === 'server/PROVIDER_TEST_ID_MAP',
      );
      expect(match).toBeDefined();
    });

    it('does NOT flag a provider that is present in both aiVideoProviders and providerTestIdMap', () => {
      const params = makeParams({
        videoCatalog: [{ id: 'has-test-id', showInDropdown: true }],
        sharedVideoProviders: { 'has-test-id': {} },
        aiVideoProviders: { 'has-test-id': {} },
        providerTestIdMap: { 'has-test-id': 'test-has-test-id' },
      });

      const gaps = findCatalogSyncGaps(params);
      expect(
        gaps.filter(g => g.id === 'has-test-id' && g.registry === 'server/PROVIDER_TEST_ID_MAP'),
      ).toHaveLength(0);
    });
  });

  describe('gap direction 4: dropdown-visible image provider missing from server IMAGE_PROVIDERS', () => {
    it('catches an image catalog entry with showInDropdown:true missing from serverImageProviders', () => {
      const params = makeParams({
        imageCatalog: [{ id: 'missing-server-img', showInDropdown: true }],
        sharedImageProviders: { 'missing-server-img': {} },
        serverImageProviders: {},
      });

      const gaps = findCatalogSyncGaps(params);
      const match = gaps.find(
        g =>
          g.id === 'missing-server-img' &&
          g.direction === 'catalog→registry' &&
          g.registry === 'server/IMAGE_PROVIDERS',
      );
      expect(match).toBeDefined();
    });

    it('catches an image catalog entry with showInImageDropdown:true missing from serverImageProviders', () => {
      const params = makeParams({
        imageCatalog: [{ id: 'img-dropdown-only', showInImageDropdown: true }],
        sharedImageProviders: { 'img-dropdown-only': {} },
        serverImageProviders: {},
      });

      const gaps = findCatalogSyncGaps(params);
      const match = gaps.find(
        g =>
          g.id === 'img-dropdown-only' &&
          g.direction === 'catalog→registry' &&
          g.registry === 'server/IMAGE_PROVIDERS',
      );
      expect(match).toBeDefined();
    });

    it('catches an image catalog entry with showInI2IDropdown:true missing from serverImageProviders', () => {
      const params = makeParams({
        imageCatalog: [{ id: 'i2i-dropdown-only', showInI2IDropdown: true }],
        sharedImageProviders: { 'i2i-dropdown-only': {} },
        serverImageProviders: {},
      });

      const gaps = findCatalogSyncGaps(params);
      const match = gaps.find(
        g =>
          g.id === 'i2i-dropdown-only' &&
          g.direction === 'catalog→registry' &&
          g.registry === 'server/IMAGE_PROVIDERS',
      );
      expect(match).toBeDefined();
    });

    it('does NOT flag an image entry that is not visible in any dropdown for serverImageProviders', () => {
      const params = makeParams({
        imageCatalog: [{ id: 'hidden-img', showInDropdown: false }],
        sharedImageProviders: { 'hidden-img': {} },
        serverImageProviders: {},
      });

      const gaps = findCatalogSyncGaps(params);
      expect(
        gaps.filter(g => g.id === 'hidden-img' && g.registry === 'server/IMAGE_PROVIDERS'),
      ).toHaveLength(0);
    });
  });

  describe('multiple simultaneous gaps', () => {
    it('reports all gaps when several mismatches exist at once', () => {
      const params = makeParams({
        videoCatalog: [
          { id: 'vid-a', showInDropdown: true },
        ],
        imageCatalog: [
          { id: 'img-b', showInImageDropdown: true },
        ],
        sharedVideoProviders: { 'orphan-v': {} },
        sharedImageProviders: { 'orphan-i': {} },
        aiVideoProviders: {},
        providerTestIdMap: {},
        serverImageProviders: {},
      });

      const gaps = findCatalogSyncGaps(params);

      expect(gaps.some(g => g.id === 'vid-a' && g.registry === 'shared/VIDEO_PROVIDERS')).toBe(true);
      expect(gaps.some(g => g.id === 'img-b' && g.registry === 'shared/IMAGE_PROVIDERS')).toBe(true);
      expect(gaps.some(g => g.id === 'orphan-v' && g.direction === 'registry→catalog')).toBe(true);
      expect(gaps.some(g => g.id === 'orphan-i' && g.direction === 'registry→catalog')).toBe(true);
      expect(gaps.some(g => g.id === 'vid-a' && g.registry === 'server/AI_VIDEO_PROVIDERS')).toBe(true);
      expect(gaps.some(g => g.id === 'img-b' && g.registry === 'server/IMAGE_PROVIDERS')).toBe(true);
    });
  });
});
