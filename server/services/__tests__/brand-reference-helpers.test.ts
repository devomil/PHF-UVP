import { describe, it, expect } from 'vitest';
import {
  applyReferenceSetToScenes,
  sanitizeBrandReferenceList,
  MAX_BRAND_REFERENCE_SET_ENTRIES,
} from '../brand-reference-helpers';
import type { BrandReferenceInput, Scene } from '../../../shared/video-types';

function makeScene(overrides: Partial<Scene> & { id?: string | number } = {}): Scene {
  return {
    id: 'scene-1',
    sceneNumber: 1,
    description: 'A scene',
    duration: 5,
    ...overrides,
  } as Scene;
}

function ref(url: string, extra: Partial<BrandReferenceInput> = {}): BrandReferenceInput {
  return { assetUrl: url, tag: 'placeholder', ...extra };
}

describe('applyReferenceSetToScenes', () => {
  describe('only-product targeting (target: all-product)', () => {
    it('attaches references to product/solution scenes and skips everything else', () => {
      const scenes: Scene[] = [
        makeScene({ id: 's1', contentType: 'product' } as any),
        makeScene({ id: 's2', contentType: 'solution' } as any),
        makeScene({ id: 's3', contentType: 'cta' } as any),
        makeScene({ id: 's4', contentType: 'intro' } as any),
        makeScene({ id: 's5', contentType: 'outro' } as any),
        makeScene({ id: 's6', contentType: 'branded-environment' } as any),
      ];
      const setRefs = [ref('https://cdn.test/a.png'), ref('https://cdn.test/b.png')];

      const result = applyReferenceSetToScenes(scenes, setRefs, { target: 'all-product' });

      expect(result.attachedCount).toBe(2);
      expect(result.skippedNonProductType).toBe(4);
      expect(result.skippedAlreadyHasRefs).toBe(0);
      const withRefs = result.scenes.filter(
        (s) => (s as any).brandReferences && (s as any).brandReferences.length > 0,
      );
      expect(withRefs).toHaveLength(2);
      expect(withRefs.map((s) => (s as any).id)).toEqual(['s1', 's2']);
      for (const s of withRefs) {
        expect((s as any).useOmniReference).toBe(true);
      }
    });

    it('also recognizes product intent via legacy `type` field and `assets.sceneType`', () => {
      const scenes: Scene[] = [
        makeScene({ id: 'a', type: 'product' } as any),
        makeScene({ id: 'b', assets: { sceneType: 'product-hero' } } as any),
        makeScene({ id: 'c', assets: { sceneType: 'product-in-context' } } as any),
        makeScene({ id: 'd', assets: { sceneType: 'branded-environment' } } as any),
      ];
      const setRefs = [ref('https://cdn.test/a.png')];

      const result = applyReferenceSetToScenes(scenes, setRefs, { target: 'all-product' });

      expect(result.attachedCount).toBe(3);
      expect(result.skippedNonProductType).toBe(1);
    });
  });

  describe('replaceExisting flag', () => {
    const setRefs = [ref('https://cdn.test/new.png', { label: 'New' })];

    it('skips scenes with existing brandReferences when replaceExisting is false (default)', () => {
      const scenes: Scene[] = [
        makeScene({
          id: 's1',
          contentType: 'product',
          brandReferences: [
            { assetUrl: 'https://cdn.test/old.png', tag: 'image1', label: 'Old' },
          ],
        } as any),
        makeScene({ id: 's2', contentType: 'product' } as any),
      ];

      const result = applyReferenceSetToScenes(scenes, setRefs, { target: 'all-product' });

      expect(result.attachedCount).toBe(1);
      expect(result.skippedAlreadyHasRefs).toBe(1);
      expect((result.scenes[0] as any).brandReferences[0].assetUrl).toBe('https://cdn.test/old.png');
      expect((result.scenes[1] as any).brandReferences[0].assetUrl).toBe('https://cdn.test/new.png');
    });

    it('overwrites existing brandReferences when replaceExisting is true', () => {
      const scenes: Scene[] = [
        makeScene({
          id: 's1',
          contentType: 'product',
          brandReferences: [
            { assetUrl: 'https://cdn.test/old.png', tag: 'image1', label: 'Old' },
          ],
        } as any),
      ];

      const result = applyReferenceSetToScenes(scenes, setRefs, {
        target: 'all-product',
        replaceExisting: true,
      });

      expect(result.attachedCount).toBe(1);
      expect(result.skippedAlreadyHasRefs).toBe(0);
      expect((result.scenes[0] as any).brandReferences[0].assetUrl).toBe('https://cdn.test/new.png');
      expect((result.scenes[0] as any).brandReferences[0].label).toBe('New');
      expect((result.scenes[0] as any).useOmniReference).toBe(true);
    });
  });

  describe('tag re-normalization to image1..imageN', () => {
    it('rewrites incoming tags so the final scene uses image1, image2, image3 in array order', () => {
      const scenes: Scene[] = [makeScene({ id: 's1', contentType: 'product' } as any)];
      // Deliberately scrambled / wrong tags coming in.
      const setRefs: BrandReferenceInput[] = [
        { assetUrl: 'https://cdn.test/box.png', tag: 'image7' },
        { assetUrl: 'https://cdn.test/bottle.png', tag: 'image2' },
        { assetUrl: 'https://cdn.test/pack.png', tag: 'something-else' },
      ];

      const result = applyReferenceSetToScenes(scenes, setRefs, { target: 'all-product' });

      const refs = (result.scenes[0] as any).brandReferences as BrandReferenceInput[];
      expect(refs.map((r) => r.tag)).toEqual(['image1', 'image2', 'image3']);
      // Order preserved from input array.
      expect(refs.map((r) => r.assetUrl)).toEqual([
        'https://cdn.test/box.png',
        'https://cdn.test/bottle.png',
        'https://cdn.test/pack.png',
      ]);
    });

    it('returns fresh objects per scene (no shared reference between scenes)', () => {
      const scenes: Scene[] = [
        makeScene({ id: 's1', contentType: 'product' } as any),
        makeScene({ id: 's2', contentType: 'product' } as any),
      ];
      const setRefs = [ref('https://cdn.test/a.png')];

      const result = applyReferenceSetToScenes(scenes, setRefs, { target: 'all-product' });

      const refsA = (result.scenes[0] as any).brandReferences as BrandReferenceInput[];
      const refsB = (result.scenes[1] as any).brandReferences as BrandReferenceInput[];
      expect(refsA).not.toBe(refsB);
      expect(refsA[0]).not.toBe(refsB[0]);
    });
  });

  describe('empty-set early return', () => {
    it('does nothing when given an empty setReferences array and leaves scenes untouched', () => {
      const scenes: Scene[] = [
        makeScene({ id: 's1', contentType: 'product' } as any),
        makeScene({
          id: 's2',
          contentType: 'product',
          brandReferences: [{ assetUrl: 'https://cdn.test/x.png', tag: 'image1' }],
        } as any),
      ];

      const result = applyReferenceSetToScenes(scenes, [], { target: 'all-product' });

      expect(result.attachedCount).toBe(0);
      expect(result.skippedAlreadyHasRefs).toBe(0);
      expect(result.skippedNonProductType).toBe(0);
      // Same array instance returned — no scene mutation.
      expect(result.scenes).toBe(scenes);
      expect((result.scenes[0] as any).brandReferences).toBeUndefined();
      expect((result.scenes[1] as any).brandReferences[0].assetUrl).toBe('https://cdn.test/x.png');
    });
  });

  describe('target: "all"', () => {
    it('attaches references to every scene regardless of contentType', () => {
      const scenes: Scene[] = [
        makeScene({ id: 's1', contentType: 'product' } as any),
        makeScene({ id: 's2', contentType: 'cta' } as any),
        makeScene({ id: 's3', contentType: 'intro' } as any),
      ];
      const setRefs = [ref('https://cdn.test/a.png')];

      const result = applyReferenceSetToScenes(scenes, setRefs, { target: 'all' });

      expect(result.attachedCount).toBe(3);
      expect(result.skippedNonProductType).toBe(0);
    });
  });
});

describe('sanitizeBrandReferenceList', () => {
  it('rejects non-array input', () => {
    expect(sanitizeBrandReferenceList(null)).toBeNull();
    expect(sanitizeBrandReferenceList(undefined)).toBeNull();
    expect(sanitizeBrandReferenceList('not-an-array')).toBeNull();
    expect(sanitizeBrandReferenceList({ assetUrl: 'x' })).toBeNull();
  });

  it('rejects empty arrays', () => {
    expect(sanitizeBrandReferenceList([])).toBeNull();
  });

  it(`rejects arrays larger than ${MAX_BRAND_REFERENCE_SET_ENTRIES}`, () => {
    const tooMany = Array.from({ length: MAX_BRAND_REFERENCE_SET_ENTRIES + 1 }, (_, i) => ({
      assetUrl: `https://cdn.test/${i}.png`,
    }));
    expect(sanitizeBrandReferenceList(tooMany)).toBeNull();
  });

  it(`accepts arrays up to ${MAX_BRAND_REFERENCE_SET_ENTRIES} entries`, () => {
    const max = Array.from({ length: MAX_BRAND_REFERENCE_SET_ENTRIES }, (_, i) => ({
      assetUrl: `https://cdn.test/${i}.png`,
    }));
    const out = sanitizeBrandReferenceList(max);
    expect(out).not.toBeNull();
    expect(out!).toHaveLength(MAX_BRAND_REFERENCE_SET_ENTRIES);
    expect(out!.map((r) => r.tag)).toEqual(
      Array.from({ length: MAX_BRAND_REFERENCE_SET_ENTRIES }, (_, i) => `image${i + 1}`),
    );
  });

  it('rejects entries that are missing assetUrl or have a non-string assetUrl', () => {
    expect(sanitizeBrandReferenceList([{ tag: 'image1' }])).toBeNull();
    expect(sanitizeBrandReferenceList([{ assetUrl: '' }])).toBeNull();
    expect(sanitizeBrandReferenceList([{ assetUrl: '   ' }])).toBeNull();
    expect(sanitizeBrandReferenceList([{ assetUrl: 123 }])).toBeNull();
    expect(sanitizeBrandReferenceList([null])).toBeNull();
    expect(sanitizeBrandReferenceList([{ assetUrl: 'ok' }, null])).toBeNull();
  });

  it('trims assetUrl whitespace and renumbers tags to image1..imageN', () => {
    const out = sanitizeBrandReferenceList([
      { assetUrl: '  https://cdn.test/a.png  ', tag: 'wrong' },
      { assetUrl: 'https://cdn.test/b.png' },
      { assetUrl: 'https://cdn.test/c.png', tag: 'image9' },
    ]);
    expect(out).not.toBeNull();
    expect(out!.map((r) => r.assetUrl)).toEqual([
      'https://cdn.test/a.png',
      'https://cdn.test/b.png',
      'https://cdn.test/c.png',
    ]);
    expect(out!.map((r) => r.tag)).toEqual(['image1', 'image2', 'image3']);
  });

  it('preserves optional metadata (assetId, label, width, height)', () => {
    const out = sanitizeBrandReferenceList([
      {
        assetUrl: 'https://cdn.test/a.png',
        assetId: 42,
        label: 'Product',
        width: 1024,
        height: 768,
      },
    ]);
    expect(out).not.toBeNull();
    expect(out![0]).toEqual({
      assetUrl: 'https://cdn.test/a.png',
      assetId: 42,
      label: 'Product',
      width: 1024,
      height: 768,
      tag: 'image1',
    });
  });
});
