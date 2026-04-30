import { describe, it, expect } from 'vitest';
import {
  getDefaultDurationForStyle,
  SCENE_DEFAULT_DURATION_FALLBACK,
} from '../scene-defaults';

describe('getDefaultDurationForStyle', () => {
  it('returns the per-style default for known visual styles', () => {
    // Phase 20D regression — these are the canonical seeds and the
    // "Scene defaults" popover reads from the same map. Changing any
    // of these intentionally requires updating the popover copy too.
    expect(getDefaultDurationForStyle('social')).toBe(5);
    expect(getDefaultDurationForStyle('lifestyle')).toBe(8);
    expect(getDefaultDurationForStyle('product')).toBe(8);
    expect(getDefaultDurationForStyle('educational')).toBe(10);
    expect(getDefaultDurationForStyle('hero')).toBe(12);
    expect(getDefaultDurationForStyle('premium')).toBe(12);
  });

  it('is case-insensitive', () => {
    expect(getDefaultDurationForStyle('Hero')).toBe(12);
    expect(getDefaultDurationForStyle('SOCIAL')).toBe(5);
  });

  it('falls back to 8 for unknown / missing styles', () => {
    expect(getDefaultDurationForStyle('unknown-style')).toBe(SCENE_DEFAULT_DURATION_FALLBACK);
    expect(getDefaultDurationForStyle('')).toBe(SCENE_DEFAULT_DURATION_FALLBACK);
    expect(getDefaultDurationForStyle(null)).toBe(SCENE_DEFAULT_DURATION_FALLBACK);
    expect(getDefaultDurationForStyle(undefined)).toBe(SCENE_DEFAULT_DURATION_FALLBACK);
  });

  it('exposes a fallback constant of 8 seconds', () => {
    expect(SCENE_DEFAULT_DURATION_FALLBACK).toBe(8);
  });
});
