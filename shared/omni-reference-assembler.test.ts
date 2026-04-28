import { describe, it, expect } from 'vitest';
import {
  assembleOmniReferenceImages,
  assembleOmniReferenceImagesForScene,
  shiftImageTags,
} from './omni-reference-assembler';
import type { BrandReferenceInput } from './video-types';

const ref = (assetUrl: string, tag = 'image1', label?: string): BrandReferenceInput => ({
  assetUrl,
  tag,
  label,
});

describe('shiftImageTags', () => {
  it('returns the input unchanged when offset is 0', () => {
    expect(shiftImageTags('foo @image1 bar', 0)).toBe('foo @image1 bar');
  });
  it('shifts every @imageN tag by the given offset', () => {
    expect(shiftImageTags('@image1 and @image2', 1)).toBe('@image2 and @image3');
  });
  it('does not double-shift adjacent indices', () => {
    // After shifting @image1 → @image2, @image2 must NOT then become @image3.
    expect(shiftImageTags('@image1 next @image2 final @image3', 1))
      .toBe('@image2 next @image3 final @image4');
  });
  it('is case-insensitive', () => {
    expect(shiftImageTags('@IMAGE1 and @Image2', 1)).toBe('@image2 and @image3');
  });
  it('returns input unchanged when no tags are present', () => {
    expect(shiftImageTags('plain prompt with no tags', 1)).toBe('plain prompt with no tags');
  });
});

describe('assembleOmniReferenceImages', () => {
  describe('Branch 4 — neither seed nor refs', () => {
    it('returns the prompt verbatim, empty imageList, mode "none"', () => {
      const r = assembleOmniReferenceImages({
        basePrompt: 'A serene meadow at sunset',
        seedImageUrl: null,
        references: [],
      });
      expect(r.mode).toBe('none');
      expect(r.imageList).toEqual([]);
      expect(r.prompt).toBe('A serene meadow at sunset');
      expect(r.promptShifted).toBe(false);
    });

    it('treats empty-string seed as no seed', () => {
      const r = assembleOmniReferenceImages({
        basePrompt: 'x',
        seedImageUrl: '',
        references: [],
      });
      expect(r.mode).toBe('none');
    });
  });

  describe('Branch 3 — refs-only (legacy Phase 20C path)', () => {
    it('preserves an existing @image1 token', () => {
      const r = assembleOmniReferenceImages({
        basePrompt: 'Hero shot of @image1 on a marble countertop',
        references: [ref('https://cdn.test/a.png')],
      });
      expect(r.mode).toBe('refs-only');
      expect(r.imageList).toEqual(['https://cdn.test/a.png']);
      expect(r.prompt).toContain('@image1');
    });

    it('injects @image1 via noun replacement when no tag exists', () => {
      const r = assembleOmniReferenceImages({
        basePrompt: 'Close-up of the supplement bottle on a wooden table',
        references: [ref('https://cdn.test/a.png')],
      });
      expect(r.mode).toBe('refs-only');
      expect(r.prompt).toMatch(/@image1/);
      expect(r.prompt).not.toMatch(/supplement bottle/);
    });
  });

  describe('Branch 2 — seed only', () => {
    it('sets seed as @image1 with no prompt shift', () => {
      const r = assembleOmniReferenceImages({
        basePrompt: 'A close-up of the bottle',
        seedImageUrl: 'https://cdn.test/seed.png',
        references: [],
      });
      expect(r.mode).toBe('seed-only');
      expect(r.imageList).toEqual(['https://cdn.test/seed.png']);
      expect(r.prompt).toMatch(/@image1/);
      expect(r.promptShifted).toBe(false);
    });
  });

  describe('Branch 1 — seed + refs', () => {
    it('prepends seed at index 0 and shifts existing @imageN tokens', () => {
      const r = assembleOmniReferenceImages({
        basePrompt: 'Place @image1 next to @image2 with the logo from @image3',
        seedImageUrl: 'https://cdn.test/seed.png',
        references: [
          ref('https://cdn.test/ref-a.png', 'image1', 'product'),
          ref('https://cdn.test/ref-b.png', 'image2', 'logo'),
          ref('https://cdn.test/ref-c.png', 'image3', 'env'),
        ],
      });
      expect(r.mode).toBe('seed+refs');
      expect(r.imageList).toEqual([
        'https://cdn.test/seed.png',
        'https://cdn.test/ref-a.png',
        'https://cdn.test/ref-b.png',
        'https://cdn.test/ref-c.png',
      ]);
      // All original tags should have shifted by +1.
      expect(r.prompt).toContain('@image2');
      expect(r.prompt).toContain('@image3');
      expect(r.prompt).toContain('@image4');
      // The seed must be the new @image1 — buildOmniReferencePrompt sees it
      // already-tagged in the shifted prompt (no, it's NOT in shifted prompt
      // because original had @image1 which became @image2). So the helper
      // must have either noun-injected or appended @image1.
      expect(r.prompt).toMatch(/@image1/);
      expect(r.promptShifted).toBe(true);
    });

    it('handles seed + refs with no existing @imageN tokens (pure narrative prompt)', () => {
      const r = assembleOmniReferenceImages({
        basePrompt: 'A morning routine in a sunlit kitchen with the supplement bottle',
        seedImageUrl: 'https://cdn.test/seed.png',
        references: [ref('https://cdn.test/logo.png', 'image1', 'logo')],
      });
      expect(r.mode).toBe('seed+refs');
      expect(r.imageList).toEqual(['https://cdn.test/seed.png', 'https://cdn.test/logo.png']);
      expect(r.promptShifted).toBe(false); // nothing to shift
      expect(r.prompt).toMatch(/@image1/); // injected for the seed
    });

    it('drops references with empty assetUrl', () => {
      const r = assembleOmniReferenceImages({
        basePrompt: 'x',
        seedImageUrl: 'https://cdn.test/seed.png',
        references: [
          ref('https://cdn.test/a.png'),
          { assetUrl: '', tag: 'image2' },
          ref('https://cdn.test/c.png'),
        ],
      });
      expect(r.imageList).toEqual([
        'https://cdn.test/seed.png',
        'https://cdn.test/a.png',
        'https://cdn.test/c.png',
      ]);
    });
  });
});

describe('assembleOmniReferenceImagesForScene', () => {
  it('forwards scene.seedImageUrl + scene.brandReferences when no override given', () => {
    const r = assembleOmniReferenceImagesForScene(
      {
        seedImageUrl: 'https://cdn.test/seed.png',
        brandReferences: [ref('https://cdn.test/logo.png')],
      },
      { basePrompt: 'A morning routine' }
    );
    expect(r.mode).toBe('seed+refs');
    expect(r.imageList).toEqual(['https://cdn.test/seed.png', 'https://cdn.test/logo.png']);
  });

  it('uses resolvedReferences override when provided', () => {
    const r = assembleOmniReferenceImagesForScene(
      {
        seedImageUrl: undefined,
        brandReferences: [ref('https://cdn.test/orig.png')],
      },
      {
        basePrompt: 'A morning routine',
        resolvedReferences: [ref('https://cdn.test/resolved.png')],
      }
    );
    expect(r.mode).toBe('refs-only');
    expect(r.imageList).toEqual(['https://cdn.test/resolved.png']);
  });
});
