// Focused contract tests for the PATCH /scenes/:sceneId allowlist.
//
// These lock the API contract for `generateNativeAudio` (added in
// Phase 20D) and prove the allowlist still drops unknown fields.

import { describe, it, expect } from 'vitest';
import {
  SCENE_PATCH_ALLOWED_FIELDS,
  SCENE_PATCH_CLEARABLE_FIELDS,
  applyScenePatchAllowlist,
} from '../scene-patch-allowlist';

describe('PATCH scene allowlist — generateNativeAudio contract', () => {
  it('lists generateNativeAudio in the allowlist', () => {
    expect(SCENE_PATCH_ALLOWED_FIELDS).toContain('generateNativeAudio');
  });

  it('does NOT mark generateNativeAudio as clearable (false / undefined are the off state)', () => {
    expect(SCENE_PATCH_CLEARABLE_FIELDS.has('generateNativeAudio')).toBe(false);
  });

  it('does NOT list classifier-metadata fields in the allowlist (server-owned)', () => {
    for (const f of [
      'classifierConfidence',
      'classifierReasoning',
      'classifiedAt',
      'manuallyClassified',
      'renderSystemType',
    ]) {
      expect(SCENE_PATCH_ALLOWED_FIELDS).not.toContain(f);
    }
  });

  it('round-trips generateNativeAudio: true → scene.generateNativeAudio === true', () => {
    const scene: Record<string, unknown> = { id: 's1', generateNativeAudio: false };
    const result = applyScenePatchAllowlist(scene, { generateNativeAudio: true });
    expect(scene.generateNativeAudio).toBe(true);
    expect(result.applied).toContain('generateNativeAudio');
    expect(result.ignored).toEqual([]);
  });

  it('round-trips generateNativeAudio: false → scene.generateNativeAudio === false', () => {
    const scene: Record<string, unknown> = { id: 's1', generateNativeAudio: true };
    const result = applyScenePatchAllowlist(scene, { generateNativeAudio: false });
    expect(scene.generateNativeAudio).toBe(false);
    expect(result.applied).toContain('generateNativeAudio');
  });

  it('null for generateNativeAudio writes through (treated as falsy "off") — does NOT delete the key', () => {
    const scene: Record<string, unknown> = { id: 's1', generateNativeAudio: true };
    applyScenePatchAllowlist(scene, { generateNativeAudio: null });
    // Non-clearable fields keep null instead of being deleted; the
    // resulting value is still falsy, so downstream "is native audio
    // on?" checks see the right answer.
    expect(scene.generateNativeAudio).toBeNull();
    expect(Object.prototype.hasOwnProperty.call(scene, 'generateNativeAudio')).toBe(true);
  });

  it('drops unknown / forged fields from the patch payload', () => {
    const scene: Record<string, unknown> = { id: 's1', duration: 5 };
    const result = applyScenePatchAllowlist(scene, {
      duration: 8,
      generateNativeAudio: true,
      // Forged + unknown fields the route must NOT write:
      manuallyClassified: false,
      classifierConfidence: 99,
      arbitraryAttackerField: 'pwned',
      __proto__: { polluted: true },
    });
    expect(scene.duration).toBe(8);
    expect(scene.generateNativeAudio).toBe(true);
    expect(scene.manuallyClassified).toBeUndefined();
    expect(scene.classifierConfidence).toBeUndefined();
    expect(scene.arbitraryAttackerField).toBeUndefined();
    expect(result.applied).toEqual(
      expect.arrayContaining(['duration', 'generateNativeAudio']),
    );
    expect(result.ignored).toEqual(
      expect.arrayContaining([
        'manuallyClassified',
        'classifierConfidence',
        'arbitraryAttackerField',
      ]),
    );
  });

  it('clears clearable fields when value is null (e.g. artPresetId)', () => {
    const scene: Record<string, unknown> = { id: 's1', artPresetId: 'preset-a' };
    applyScenePatchAllowlist(scene, { artPresetId: null });
    expect(scene.artPresetId).toBeUndefined();
  });
});
