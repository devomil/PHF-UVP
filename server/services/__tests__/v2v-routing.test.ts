// Unit tests for V2V scene regeneration routing logic.
//
// Covers three load-bearing behaviors:
//   (a) Provider auto-resolution: when mode='video-to-video' and no provider
//       is supplied (or 'auto'), getDropdownV2VProviders()[1].id is chosen.
//   (b) Worker detection: assetLibraryMode='v2v' routes to Runway or Kling
//       directly (never through dispatchRender).
//   (c) Guard: a V2V job without referenceVideoUrl throws before any provider
//       is contacted.

import { describe, it, expect } from 'vitest';
import {
  buildV2VRouteDecision,
  resolveV2VProvider,
} from '../v2v-job-router';
import { getDropdownV2VProviders } from '../../../shared/provider-catalog';

// ---------------------------------------------------------------------------
// 1. Provider auto-resolution
// ---------------------------------------------------------------------------

describe('resolveV2VProvider — auto-resolution', () => {
  it('uses the first real catalog entry (index 1 in getDropdownV2VProviders) when provider is absent', () => {
    const v2vProviders = getDropdownV2VProviders();
    // Index 0 is always the synthetic 'auto' entry
    expect(v2vProviders[0].id).toBe('auto');
    // Index 1 is the first real provider the route handler would pick
    const expectedId = v2vProviders[1].id;

    const resolved = resolveV2VProvider(undefined, v2vProviders);
    expect(resolved).toBe(expectedId);
  });

  it('uses the first real catalog entry when provider is the "auto" sentinel', () => {
    const v2vProviders = getDropdownV2VProviders();
    const expectedId = v2vProviders.find(p => p.id !== 'auto')!.id;

    const resolved = resolveV2VProvider('auto', v2vProviders);
    expect(resolved).toBe(expectedId);
  });

  it('returns the caller-supplied provider unchanged when it is a real value', () => {
    const v2vProviders = getDropdownV2VProviders();
    const resolved = resolveV2VProvider('runway-gen4-aleph', v2vProviders);
    expect(resolved).toBe('runway-gen4-aleph');
  });

  it('falls back to kling-2.6 when the catalog list contains only the synthetic auto entry', () => {
    const syntheticOnly = [{ id: 'auto', name: 'Auto', description: '' }];
    const resolved = resolveV2VProvider(undefined, syntheticOnly);
    expect(resolved).toBe('kling-2.6');
  });

  it('falls back to kling-2.6 when the catalog list is empty', () => {
    const resolved = resolveV2VProvider('auto', []);
    expect(resolved).toBe('kling-2.6');
  });

  it('getDropdownV2VProviders always has at least two entries (auto + one real)', () => {
    const list = getDropdownV2VProviders();
    expect(list.length).toBeGreaterThanOrEqual(2);
    expect(list[1].id).not.toBe('auto');
  });
});

// ---------------------------------------------------------------------------
// 2. Worker V2V detection — calls provider branch, not dispatchRender
// ---------------------------------------------------------------------------

describe('buildV2VRouteDecision — V2V detection and routing', () => {
  const validV2VSettings = {
    assetLibraryMode: 'v2v',
    referenceVideoUrl: 'https://cdn.example.com/ref-clip.mp4',
  };

  it('detects a V2V job and returns isV2V=true', () => {
    const decision = buildV2VRouteDecision(validV2VSettings, 'kling-2.6', 'https://cdn.example.com/image.jpg');
    expect(decision.isV2V).toBe(true);
  });

  it('returns isV2V=false for a normal (non-V2V) job', () => {
    const nonV2VSettings = { assetLibraryMode: 'standard' };
    const decision = buildV2VRouteDecision(nonV2VSettings, 'kling-2.6', undefined);
    expect(decision.isV2V).toBe(false);
  });

  it('returns isV2V=false when i2vSettings is null', () => {
    const decision = buildV2VRouteDecision(null, 'kling-2.6', undefined);
    expect(decision.isV2V).toBe(false);
  });

  it('returns isV2V=false when i2vSettings is undefined', () => {
    const decision = buildV2VRouteDecision(undefined, undefined, undefined);
    expect(decision.isV2V).toBe(false);
  });

  it('routes to Runway (isRunwayV2V=true) when provider starts with "runway"', () => {
    const decision = buildV2VRouteDecision(validV2VSettings, 'runway-gen4-aleph', undefined);
    expect(decision.isV2V).toBe(true);
    if (!decision.isV2V) return;
    expect(decision.isRunwayV2V).toBe(true);
    expect(decision.jobProvider).toBe('runway-gen4-aleph');
  });

  it('routes to Kling (isRunwayV2V=false) when provider is kling-2.6', () => {
    const decision = buildV2VRouteDecision(
      validV2VSettings,
      'kling-2.6',
      'https://cdn.example.com/image.jpg',
    );
    expect(decision.isV2V).toBe(true);
    if (!decision.isV2V) return;
    expect(decision.isRunwayV2V).toBe(false);
    expect(decision.jobProvider).toBe('kling-2.6');
  });

  it('defaults to kling-2.6 when provider is the "auto" sentinel', () => {
    const decision = buildV2VRouteDecision(
      validV2VSettings,
      'auto',
      'https://cdn.example.com/image.jpg',
    );
    expect(decision.isV2V).toBe(true);
    if (!decision.isV2V) return;
    expect(decision.jobProvider).toBe('kling-2.6');
    expect(decision.isRunwayV2V).toBe(false);
  });

  it('defaults to kling-2.6 when provider is absent', () => {
    const decision = buildV2VRouteDecision(
      validV2VSettings,
      undefined,
      'https://cdn.example.com/image.jpg',
    );
    expect(decision.isV2V).toBe(true);
    if (!decision.isV2V) return;
    expect(decision.jobProvider).toBe('kling-2.6');
  });

  it('passes the referenceVideoUrl through in the decision', () => {
    const decision = buildV2VRouteDecision(validV2VSettings, 'kling-2.6', 'https://cdn.example.com/image.jpg');
    expect(decision.isV2V).toBe(true);
    if (!decision.isV2V) return;
    expect(decision.refVideoUrl).toBe('https://cdn.example.com/ref-clip.mp4');
  });

  it('passes the sourceImageUrl as replacementImage in the decision', () => {
    const replacementImg = 'https://cdn.example.com/product.jpg';
    const decision = buildV2VRouteDecision(validV2VSettings, 'kling-2.6', replacementImg);
    expect(decision.isV2V).toBe(true);
    if (!decision.isV2V) return;
    expect(decision.replacementImage).toBe(replacementImg);
  });

  it('sets replacementImage to undefined when no sourceImageUrl (Runway path — no image required)', () => {
    const decision = buildV2VRouteDecision(validV2VSettings, 'runway-gen4-aleph', null);
    expect(decision.isV2V).toBe(true);
    if (!decision.isV2V) return;
    expect(decision.replacementImage).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 3. Guard: missing referenceVideoUrl throws before any provider is called
// ---------------------------------------------------------------------------

describe('buildV2VRouteDecision — referenceVideoUrl guard', () => {
  it('throws when assetLibraryMode is v2v but referenceVideoUrl is missing', () => {
    const badSettings = { assetLibraryMode: 'v2v' };
    expect(() =>
      buildV2VRouteDecision(badSettings, 'kling-2.6', 'https://cdn.example.com/image.jpg'),
    ).toThrow('[V2V] Job is marked as V2V but has no referenceVideoUrl in i2vSettings');
  });

  it('throws when assetLibraryMode is v2v and referenceVideoUrl is an empty string', () => {
    const badSettings = { assetLibraryMode: 'v2v', referenceVideoUrl: '' };
    expect(() =>
      buildV2VRouteDecision(badSettings, 'kling-2.6', 'https://cdn.example.com/image.jpg'),
    ).toThrow('[V2V] Job is marked as V2V but has no referenceVideoUrl in i2vSettings');
  });

  it('throws before making any provider call (no async side-effects in the guard)', () => {
    const badSettings = { assetLibraryMode: 'v2v' };
    let threw = false;
    try {
      buildV2VRouteDecision(badSettings, 'runway-gen4-aleph', undefined);
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  it('does NOT throw when referenceVideoUrl is present', () => {
    const goodSettings = {
      assetLibraryMode: 'v2v',
      referenceVideoUrl: 'https://cdn.example.com/video.mp4',
    };
    expect(() =>
      buildV2VRouteDecision(goodSettings, 'runway-gen4-aleph', undefined),
    ).not.toThrow();
  });
});
