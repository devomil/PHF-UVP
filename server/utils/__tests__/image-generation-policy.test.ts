import { describe, it, expect } from 'vitest';
import {
  shouldPreferNanoBanana2,
  shouldPreferRecraft,
  selectImageProvider,
  shouldEnableWebSearch,
} from '../image-generation-policy';

describe('shouldPreferNanoBanana2', () => {
  it('returns true for lifestyle and social styles', () => {
    expect(shouldPreferNanoBanana2('lifestyle', 'product')).toBe(true);
    expect(shouldPreferNanoBanana2('social', 'cta')).toBe(true);
  });
  it('returns true for photoreal content types', () => {
    expect(shouldPreferNanoBanana2('hero', 'lifestyle')).toBe(true);
    expect(shouldPreferNanoBanana2('hero', 'person')).toBe(true);
  });
  it('returns false for product-only / educational scenes with no photoreal type', () => {
    expect(shouldPreferNanoBanana2('product', 'product')).toBe(false);
    expect(shouldPreferNanoBanana2('educational', 'cta')).toBe(false);
  });
});

describe('shouldPreferRecraft', () => {
  it('returns true for product and educational styles', () => {
    expect(shouldPreferRecraft('product', 'lifestyle')).toBe(true);
    expect(shouldPreferRecraft('educational', 'person')).toBe(true);
  });
  it('returns true for text-heavy content types', () => {
    expect(shouldPreferRecraft('hero', 'cta')).toBe(true);
    expect(shouldPreferRecraft('hero', 'benefit')).toBe(true);
  });
});

describe('selectImageProvider', () => {
  it('falls back to flux when no providers given', () => {
    expect(selectImageProvider('hero', 'lifestyle', [])).toBe('flux');
  });
  it('prefers a recraft provider when style/content suggest it', () => {
    expect(selectImageProvider('product', 'product', ['nano-banana-2', 'recraft-v4-pro', 'flux']))
      .toBe('recraft-v4-pro');
  });
  it('prefers nano-banana-2 for photoreal lifestyle scenes', () => {
    expect(selectImageProvider('lifestyle', 'lifestyle', ['nano-banana-2', 'flux']))
      .toBe('nano-banana-2');
  });
  it('falls back to first preferred when no rule matches', () => {
    expect(selectImageProvider('hero', 'product-shot', ['flux', 'recraft-v4-pro']))
      .toBe('flux');
  });
});

describe('shouldEnableWebSearch', () => {
  it('returns true for grounded styles (lifestyle, educational, social)', () => {
    expect(shouldEnableWebSearch('lifestyle', 'product')).toBe(true);
    expect(shouldEnableWebSearch('educational', 'product')).toBe(true);
    expect(shouldEnableWebSearch('social', 'product')).toBe(true);
  });
  it('returns true for grounded content types (nature, lifestyle, place)', () => {
    expect(shouldEnableWebSearch('hero', 'nature')).toBe(true);
    expect(shouldEnableWebSearch('hero', 'place')).toBe(true);
  });
  it('returns false for purely abstract / studio scenes', () => {
    expect(shouldEnableWebSearch('hero', 'product')).toBe(false);
    expect(shouldEnableWebSearch('product', 'cta')).toBe(false);
    expect(shouldEnableWebSearch('premium', 'product')).toBe(false);
  });
});
