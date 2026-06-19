import { describe, it, expect, afterEach } from 'vitest';
import {
  getDropdownImageProviders,
  getDropdownVideoProviders,
  VIDEO_PROVIDER_CATALOG,
  IMAGE_PROVIDER_CATALOG,
} from '../provider-catalog';

const AUTO_VIDEO = {
  id: 'auto',
  name: 'Auto (Best Match)',
  description: 'Automatically picks the best provider for your prompt and style',
};

const AUTO_IMAGE = {
  id: 'auto',
  name: 'Auto (Best Match)',
  description: 'Automatically picks the best image provider for your prompt and style',
};

describe('getDropdownVideoProviders', () => {
  afterEach(() => {
    // Remove any test entries pushed onto the catalog during individual tests
    const idx = VIDEO_PROVIDER_CATALOG.findIndex(p => p.id.startsWith('__test__'));
    if (idx !== -1) VIDEO_PROVIDER_CATALOG.splice(idx, 1);
  });

  it('always puts the auto-select entry first', () => {
    const list = getDropdownVideoProviders();
    expect(list[0]).toEqual(AUTO_VIDEO);
  });

  it('auto-select entry is first even when no other providers have showInDropdown', () => {
    // Temporarily clear showInDropdown from all entries for an isolated check
    // Instead: push a single entry without showInDropdown and verify auto is still index 0
    VIDEO_PROVIDER_CATALOG.push({
      id: '__test__no-dropdown',
      name: 'Test No Dropdown',
      family: 'Test',
      description: 'Should not appear',
      capabilities: ['T2V'],
      maxDuration: 5,
      costTier: 'budget',
      type: 'video',
      supportedModes: ['t2v'],
      aspectRatios: ['16:9'],
      // showInDropdown intentionally omitted
    });
    const list = getDropdownVideoProviders();
    expect(list[0]).toEqual(AUTO_VIDEO);
  });

  it('a new catalog entry with showInDropdown: true automatically appears in the list', () => {
    VIDEO_PROVIDER_CATALOG.push({
      id: '__test__new-provider',
      name: 'Test New Video Provider',
      family: 'Test',
      description: 'A test video provider',
      capabilities: ['T2V'],
      maxDuration: 10,
      costTier: 'standard',
      type: 'video',
      supportedModes: ['t2v'],
      aspectRatios: ['16:9'],
      showInDropdown: true,
    });

    const list = getDropdownVideoProviders();
    const ids = list.map(p => p.id);
    expect(ids).toContain('__test__new-provider');
  });

  it('the new entry shape only exposes id, name, and description', () => {
    VIDEO_PROVIDER_CATALOG.push({
      id: '__test__shape-check',
      name: 'Test Shape Provider',
      family: 'Test',
      description: 'Shape check provider',
      capabilities: ['T2V'],
      maxDuration: 5,
      costTier: 'budget',
      type: 'video',
      supportedModes: ['t2v'],
      aspectRatios: ['16:9'],
      showInDropdown: true,
    });

    const list = getDropdownVideoProviders();
    const entry = list.find(p => p.id === '__test__shape-check');
    expect(entry).toBeDefined();
    expect(entry).toEqual({
      id: '__test__shape-check',
      name: 'Test Shape Provider',
      description: 'Shape check provider',
    });
    expect(Object.keys(entry!)).toStrictEqual(['id', 'name', 'description']);
  });

  it('catalog entries without showInDropdown are excluded', () => {
    VIDEO_PROVIDER_CATALOG.push({
      id: '__test__hidden-provider',
      name: 'Test Hidden Provider',
      family: 'Test',
      description: 'Should not appear in dropdown',
      capabilities: ['T2V'],
      maxDuration: 5,
      costTier: 'budget',
      type: 'video',
      supportedModes: ['t2v'],
      aspectRatios: ['16:9'],
      // showInDropdown intentionally omitted
    });

    const list = getDropdownVideoProviders();
    const ids = list.map(p => p.id);
    expect(ids).not.toContain('__test__hidden-provider');
  });

  it('catalog entries with showInDropdown: false are excluded', () => {
    VIDEO_PROVIDER_CATALOG.push({
      id: '__test__disabled-provider',
      name: 'Test Disabled Provider',
      family: 'Test',
      description: 'Should not appear in dropdown',
      capabilities: ['T2V'],
      maxDuration: 5,
      costTier: 'budget',
      type: 'video',
      supportedModes: ['t2v'],
      aspectRatios: ['16:9'],
      showInDropdown: false,
    });

    const list = getDropdownVideoProviders();
    const ids = list.map(p => p.id);
    expect(ids).not.toContain('__test__disabled-provider');
  });

  it('mode filter: i2v entry only appears when mode is i2v or omitted', () => {
    VIDEO_PROVIDER_CATALOG.push({
      id: '__test__i2v-only',
      name: 'Test I2V Only',
      family: 'Test',
      description: 'Only supports i2v',
      capabilities: ['I2V'],
      maxDuration: 5,
      costTier: 'budget',
      type: 'video',
      supportedModes: ['i2v'],
      aspectRatios: ['16:9'],
      showInDropdown: true,
    });

    const allList = getDropdownVideoProviders();
    const i2vList = getDropdownVideoProviders('i2v');
    const t2vList = getDropdownVideoProviders('t2v');

    expect(allList.map(p => p.id)).toContain('__test__i2v-only');
    expect(i2vList.map(p => p.id)).toContain('__test__i2v-only');
    expect(t2vList.map(p => p.id)).not.toContain('__test__i2v-only');
  });

  it('mode filter: auto-select entry is always first regardless of mode filter', () => {
    expect(getDropdownVideoProviders('t2v')[0]).toEqual(AUTO_VIDEO);
    expect(getDropdownVideoProviders('i2v')[0]).toEqual(AUTO_VIDEO);
    expect(getDropdownVideoProviders('v2v')[0]).toEqual(AUTO_VIDEO);
  });

  it('existing catalog entries with showInDropdown: true are present', () => {
    const catalogIds = VIDEO_PROVIDER_CATALOG
      .filter(p => p.showInDropdown === true)
      .map(p => p.id);

    // There must be at least one real entry or the dropdown would be useless
    expect(catalogIds.length).toBeGreaterThan(0);

    const dropdownIds = getDropdownVideoProviders().map(p => p.id);
    for (const id of catalogIds) {
      expect(dropdownIds).toContain(id);
    }
  });
});

describe('getDropdownImageProviders', () => {
  afterEach(() => {
    const idx = IMAGE_PROVIDER_CATALOG.findIndex(p => p.id.startsWith('__test__'));
    if (idx !== -1) IMAGE_PROVIDER_CATALOG.splice(idx, 1);
  });

  it('always puts the auto-select entry first', () => {
    const list = getDropdownImageProviders();
    expect(list[0]).toEqual(AUTO_IMAGE);
  });

  it('a new catalog entry with showInDropdown: true automatically appears in the list', () => {
    IMAGE_PROVIDER_CATALOG.push({
      id: '__test__new-image-provider',
      name: 'Test New Image Provider',
      family: 'Test',
      description: 'A test image provider',
      capabilities: ['T2I'],
      maxDuration: 0,
      costTier: 'budget',
      type: 'image',
      supportedModes: ['t2i'],
      aspectRatios: ['1:1'],
      showInDropdown: true,
    });

    const list = getDropdownImageProviders();
    const ids = list.map(p => p.id);
    expect(ids).toContain('__test__new-image-provider');
  });

  it('the new entry shape only exposes id, name, and description', () => {
    IMAGE_PROVIDER_CATALOG.push({
      id: '__test__img-shape-check',
      name: 'Test Image Shape',
      family: 'Test',
      description: 'Image shape check',
      capabilities: ['T2I'],
      maxDuration: 0,
      costTier: 'budget',
      type: 'image',
      supportedModes: ['t2i'],
      aspectRatios: ['1:1'],
      showInDropdown: true,
    });

    const list = getDropdownImageProviders();
    const entry = list.find(p => p.id === '__test__img-shape-check');
    expect(entry).toBeDefined();
    expect(entry).toEqual({
      id: '__test__img-shape-check',
      name: 'Test Image Shape',
      description: 'Image shape check',
    });
    expect(Object.keys(entry!)).toStrictEqual(['id', 'name', 'description']);
  });

  it('catalog entries without showInDropdown are excluded', () => {
    IMAGE_PROVIDER_CATALOG.push({
      id: '__test__img-hidden',
      name: 'Test Hidden Image',
      family: 'Test',
      description: 'Should not appear',
      capabilities: ['T2I'],
      maxDuration: 0,
      costTier: 'budget',
      type: 'image',
      supportedModes: ['t2i'],
      aspectRatios: ['1:1'],
      // showInDropdown intentionally omitted
    });

    const list = getDropdownImageProviders();
    const ids = list.map(p => p.id);
    expect(ids).not.toContain('__test__img-hidden');
  });

  it('catalog entries with showInDropdown: false are excluded', () => {
    IMAGE_PROVIDER_CATALOG.push({
      id: '__test__img-disabled',
      name: 'Test Disabled Image',
      family: 'Test',
      description: 'Should not appear',
      capabilities: ['T2I'],
      maxDuration: 0,
      costTier: 'budget',
      type: 'image',
      supportedModes: ['t2i'],
      aspectRatios: ['1:1'],
      showInDropdown: false,
    });

    const list = getDropdownImageProviders();
    const ids = list.map(p => p.id);
    expect(ids).not.toContain('__test__img-disabled');
  });

  it('existing catalog entries with showInDropdown: true are present', () => {
    const catalogIds = IMAGE_PROVIDER_CATALOG
      .filter(p => p.showInDropdown === true)
      .map(p => p.id);

    expect(catalogIds.length).toBeGreaterThan(0);

    const dropdownIds = getDropdownImageProviders().map(p => p.id);
    for (const id of catalogIds) {
      expect(dropdownIds).toContain(id);
    }
  });
});
