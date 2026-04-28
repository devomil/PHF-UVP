import { describe, it, expect } from 'vitest';
import {
  buildOmniReferencePrompt,
  analyzeReferenceHealth,
} from './omni-reference-prompt';
import type { BrandReferenceInput } from './video-types';

function ref(tag: string, url = `https://cdn.example.com/${tag}.png`): BrandReferenceInput {
  return { assetUrl: url, tag };
}

describe('buildOmniReferencePrompt', () => {
  describe('empty references', () => {
    it('returns the base prompt unchanged with injectedTag "none"', () => {
      const result = buildOmniReferencePrompt({
        basePrompt: 'A cinematic shot of the supplement bottle on a marble counter.',
        references: [],
      });

      expect(result.prompt).toBe(
        'A cinematic shot of the supplement bottle on a marble counter.',
      );
      expect(result.imageList).toEqual([]);
      expect(result.injectedTag).toBe('none');
      expect(result.usedTags).toEqual([]);
    });

    it('still surfaces existing tags in the prompt when there are no references', () => {
      const result = buildOmniReferencePrompt({
        basePrompt: 'Product hero @image1 next to logo @image2.',
        references: [],
      });

      expect(result.prompt).toBe('Product hero @image1 next to logo @image2.');
      expect(result.imageList).toEqual([]);
      expect(result.injectedTag).toBe('none');
      expect(result.usedTags.sort()).toEqual(['image1', 'image2']);
    });
  });

  describe('pre-tagged prompt preservation', () => {
    it('leaves prompts with @image1 untouched and reports "preserved"', () => {
      const basePrompt = 'Hero shot of @image1 with the logo @image2 in the corner.';
      const result = buildOmniReferencePrompt({
        basePrompt,
        references: [ref('image1'), ref('image2')],
      });

      expect(result.prompt).toBe(basePrompt);
      expect(result.injectedTag).toBe('preserved');
      expect(result.usedTags.sort()).toEqual(['image1', 'image2']);
      expect(result.imageList).toHaveLength(2);
    });

    it('preserves prompts with mixed-case @Image1', () => {
      const basePrompt = 'A close-up of @Image1 on the table.';
      const result = buildOmniReferencePrompt({
        basePrompt,
        references: [ref('image1')],
      });

      expect(result.prompt).toBe(basePrompt);
      expect(result.injectedTag).toBe('preserved');
      expect(result.usedTags).toEqual(['image1']);
    });

    it('does NOT preserve prompts that only mention @image2 (no primary @image1 anchor)', () => {
      // Spec: only @image1 acts as the primary anchor. A prompt that mentions
      // only @image2 must fall through so we still inject @image1.
      const basePrompt = 'A logo flyover @image2 above the supplement bottle.';
      const result = buildOmniReferencePrompt({
        basePrompt,
        references: [ref('image1'), ref('image2')],
      });

      expect(result.injectedTag).toBe('noun-replaced');
      expect(result.prompt).toContain('@image1');
      expect(result.prompt).toContain('@image2');
      expect(result.prompt).not.toContain('supplement bottle');
    });

    it('does not match @image10 as if it were @image1 (word boundary)', () => {
      // @image1 must be a standalone tag, not a prefix of @image10.
      const basePrompt = 'Show @image10 floating over the bottle on a counter.';
      const result = buildOmniReferencePrompt({
        basePrompt,
        references: [ref('image1')],
      });

      expect(result.injectedTag).toBe('noun-replaced');
      expect(result.prompt).toContain('@image1');
      expect(result.prompt).toContain('@image10');
    });
  });

  describe('noun replacement', () => {
    it('replaces a single-word noun (case-insensitive) with @image1', () => {
      const result = buildOmniReferencePrompt({
        basePrompt: 'A close-up of the BOTTLE on a wooden table.',
        references: [ref('image1')],
      });

      expect(result.injectedTag).toBe('noun-replaced');
      expect(result.prompt).toBe('A close-up of the @image1 on a wooden table.');
      expect(result.usedTags).toEqual(['image1']);
    });

    it('prefers the longest matching noun ("supplement bottle" wins over "bottle")', () => {
      const result = buildOmniReferencePrompt({
        basePrompt: 'A hero shot of the supplement bottle on a marble counter.',
        references: [ref('image1')],
      });

      expect(result.injectedTag).toBe('noun-replaced');
      expect(result.prompt).toBe(
        'A hero shot of the @image1 on a marble counter.',
      );
      // The shorter "bottle" must not also be replaced.
      expect(result.prompt).not.toContain('bottle');
      expect(result.prompt).not.toContain('supplement');
    });

    it('prefers the longest noun even with mixed case ("Supplement Bottle")', () => {
      const result = buildOmniReferencePrompt({
        basePrompt: 'Show the Supplement Bottle rotating slowly.',
        references: [ref('image1')],
      });

      expect(result.injectedTag).toBe('noun-replaced');
      expect(result.prompt).toBe('Show the @image1 rotating slowly.');
    });

    it('only replaces the first occurrence of the noun', () => {
      const result = buildOmniReferencePrompt({
        basePrompt: 'The bottle spins, then the bottle lands gently.',
        references: [ref('image1')],
      });

      expect(result.injectedTag).toBe('noun-replaced');
      expect(result.prompt).toBe(
        'The @image1 spins, then the bottle lands gently.',
      );
    });

    it('matches whole words only (does not replace inside "bottlecap")', () => {
      const result = buildOmniReferencePrompt({
        basePrompt: 'Zoom in on the bottlecap details.',
        references: [ref('image1')],
      });

      expect(result.injectedTag).toBe('appended');
      expect(result.prompt).toBe('Zoom in on the bottlecap details. Product: @image1.');
    });

    it('handles prompts containing regex-special characters around the noun', () => {
      const result = buildOmniReferencePrompt({
        basePrompt: 'Show the bottle (close-up) with $5.99 pricing.',
        references: [ref('image1')],
      });

      expect(result.injectedTag).toBe('noun-replaced');
      expect(result.prompt).toBe(
        'Show the @image1 (close-up) with $5.99 pricing.',
      );
    });
  });

  describe('appended phrase (no noun match)', () => {
    it('appends " Product: @image1." when no product noun is present', () => {
      const result = buildOmniReferencePrompt({
        basePrompt: 'A serene landscape with rolling hills at sunrise.',
        references: [ref('image1')],
      });

      expect(result.injectedTag).toBe('appended');
      expect(result.prompt).toBe(
        'A serene landscape with rolling hills at sunrise. Product: @image1.',
      );
      expect(result.usedTags).toEqual(['image1']);
    });

    it('does not double up sentence punctuation when prompt ends with "."', () => {
      const result = buildOmniReferencePrompt({
        basePrompt: 'A serene landscape.',
        references: [ref('image1')],
      });

      expect(result.injectedTag).toBe('appended');
      expect(result.prompt).toBe('A serene landscape. Product: @image1.');
    });

    it('does not double up sentence punctuation when prompt ends with "!"', () => {
      const result = buildOmniReferencePrompt({
        basePrompt: 'Wow look at that!',
        references: [ref('image1')],
      });

      expect(result.injectedTag).toBe('appended');
      expect(result.prompt).toBe('Wow look at that! Product: @image1.');
    });

    it('trims trailing whitespace before appending', () => {
      const result = buildOmniReferencePrompt({
        basePrompt: 'A serene landscape   ',
        references: [ref('image1')],
      });

      expect(result.injectedTag).toBe('appended');
      expect(result.prompt).toBe('A serene landscape. Product: @image1.');
    });

    it('handles an empty base prompt by appending without a leading period', () => {
      const result = buildOmniReferencePrompt({
        basePrompt: '',
        references: [ref('image1')],
      });

      expect(result.injectedTag).toBe('appended');
      expect(result.prompt).toBe(' Product: @image1.');
    });
  });

  describe('imageList', () => {
    it('includes URLs in reference order', () => {
      const result = buildOmniReferencePrompt({
        basePrompt: 'Hero shot of @image1.',
        references: [
          ref('image1', 'https://cdn.example.com/a.png'),
          ref('image2', 'https://cdn.example.com/b.png'),
          ref('image3', 'https://cdn.example.com/c.png'),
        ],
      });

      expect(result.imageList).toEqual([
        'https://cdn.example.com/a.png',
        'https://cdn.example.com/b.png',
        'https://cdn.example.com/c.png',
      ]);
    });

    it('filters out references that are missing a URL', () => {
      const result = buildOmniReferencePrompt({
        basePrompt: 'Hero shot of @image1.',
        references: [
          ref('image1', 'https://cdn.example.com/a.png'),
          { assetUrl: '', tag: 'image2' },
          ref('image3', 'https://cdn.example.com/c.png'),
        ],
      });

      expect(result.imageList).toEqual([
        'https://cdn.example.com/a.png',
        'https://cdn.example.com/c.png',
      ]);
    });
  });
});

describe('analyzeReferenceHealth', () => {
  it('returns no issues when every attached reference is used and every tag has a reference', () => {
    const issues = analyzeReferenceHealth({
      prompt: 'Hero shot of @image1 with logo @image2.',
      references: [ref('image1'), ref('image2')],
    });

    expect(issues).toEqual([]);
  });

  it('flags @image3 as a dangling tag when only 2 references are attached', () => {
    const issues = analyzeReferenceHealth({
      prompt: 'Hero shot of @image1 with @image2 and bonus @image3.',
      references: [ref('image1'), ref('image2')],
    });

    expect(issues).toContainEqual({ kind: 'dangling-tag', tag: 'image3' });
    // No unused refs in this scenario.
    expect(issues.filter((i) => i.kind === 'unused-reference')).toEqual([]);
  });

  it('flags an unused reference when a slot is attached but its tag is missing from the prompt', () => {
    const issues = analyzeReferenceHealth({
      prompt: 'Hero shot of @image1 only.',
      references: [ref('image1'), ref('image2')],
    });

    expect(issues).toContainEqual({ kind: 'unused-reference', tag: 'image2' });
    expect(issues.filter((i) => i.kind === 'dangling-tag')).toEqual([]);
  });

  it('reports both dangling and unused issues simultaneously', () => {
    const issues = analyzeReferenceHealth({
      prompt: 'Show @image1 next to @image3.',
      references: [ref('image1'), ref('image2')],
    });

    expect(issues).toContainEqual({ kind: 'dangling-tag', tag: 'image3' });
    expect(issues).toContainEqual({ kind: 'unused-reference', tag: 'image2' });
    expect(issues).toHaveLength(2);
  });

  it('detects mixed-case tags (@Image1) as used', () => {
    const issues = analyzeReferenceHealth({
      prompt: 'Hero shot of @Image1.',
      references: [ref('image1')],
    });

    expect(issues).toEqual([]);
  });

  it('does not double-count repeated tags', () => {
    const issues = analyzeReferenceHealth({
      prompt: '@image1 then @image1 again, plus dangling @image5 and @image5.',
      references: [ref('image1')],
    });

    const dangling = issues.filter((i) => i.kind === 'dangling-tag');
    expect(dangling).toEqual([{ kind: 'dangling-tag', tag: 'image5' }]);
  });

  it('returns no issues for an empty prompt with no references', () => {
    const issues = analyzeReferenceHealth({
      prompt: '',
      references: [],
    });

    expect(issues).toEqual([]);
  });
});
