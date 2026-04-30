import { describe, it, expect } from 'vitest';
import {
  clampSeedance2Duration,
  isValidSeedance2Duration,
  SEEDANCE_2_MIN_DURATION,
  SEEDANCE_2_MAX_DURATION,
} from '../duration';

describe('clampSeedance2Duration', () => {
  it('returns the value unchanged when inside [4, 15]', () => {
    expect(clampSeedance2Duration(4)).toBe(4);
    expect(clampSeedance2Duration(8)).toBe(8);
    expect(clampSeedance2Duration(15)).toBe(15);
  });

  it('clamps below 4 up to the lower bound', () => {
    expect(clampSeedance2Duration(0)).toBe(SEEDANCE_2_MIN_DURATION);
    expect(clampSeedance2Duration(3)).toBe(SEEDANCE_2_MIN_DURATION);
    expect(clampSeedance2Duration(-100)).toBe(SEEDANCE_2_MIN_DURATION);
  });

  it('clamps above 15 down to the upper bound', () => {
    expect(clampSeedance2Duration(16)).toBe(SEEDANCE_2_MAX_DURATION);
    expect(clampSeedance2Duration(60)).toBe(SEEDANCE_2_MAX_DURATION);
    expect(clampSeedance2Duration(Number.POSITIVE_INFINITY)).toBe(SEEDANCE_2_MAX_DURATION);
  });

  it('rounds fractional inputs to whole seconds', () => {
    expect(clampSeedance2Duration(7.4)).toBe(7);
    expect(clampSeedance2Duration(7.6)).toBe(8);
    expect(clampSeedance2Duration(14.51)).toBe(15);
  });

  it('falls back to lower bound for non-finite / non-numeric input', () => {
    expect(clampSeedance2Duration(NaN)).toBe(SEEDANCE_2_MIN_DURATION);
    expect(clampSeedance2Duration(undefined)).toBe(SEEDANCE_2_MIN_DURATION);
    expect(clampSeedance2Duration(null)).toBe(SEEDANCE_2_MIN_DURATION);
    expect(clampSeedance2Duration('not a number')).toBe(SEEDANCE_2_MIN_DURATION);
  });

  it('coerces numeric strings inside the range', () => {
    expect(clampSeedance2Duration('10')).toBe(10);
    expect(clampSeedance2Duration('20')).toBe(SEEDANCE_2_MAX_DURATION);
  });
});

describe('isValidSeedance2Duration', () => {
  it('accepts whole numbers in range', () => {
    expect(isValidSeedance2Duration(4)).toBe(true);
    expect(isValidSeedance2Duration(8)).toBe(true);
    expect(isValidSeedance2Duration(15)).toBe(true);
  });

  it('rejects values outside the inclusive range', () => {
    expect(isValidSeedance2Duration(3)).toBe(false);
    expect(isValidSeedance2Duration(16)).toBe(false);
    expect(isValidSeedance2Duration(0)).toBe(false);
  });

  it('rejects fractional, non-finite and non-numeric input', () => {
    expect(isValidSeedance2Duration(7.5)).toBe(false);
    expect(isValidSeedance2Duration(NaN)).toBe(false);
    expect(isValidSeedance2Duration(undefined)).toBe(false);
    expect(isValidSeedance2Duration('5')).toBe(false);
  });
});
