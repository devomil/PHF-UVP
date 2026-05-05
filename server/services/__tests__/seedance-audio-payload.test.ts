// Phase 20D (Task #126): payload regression tests for the Seedance 2
// branches. The bug we're guarding against is "we accidentally always
// emit `generate_audio: true`" or "we drop the duration clamp" — both
// would cost users credits and / or get the request rejected by PiAPI.
//
// We don't hit the network: we call the private `buildRequestBody`
// (T2V) and `buildI2VRequestBody` (I2V) via runtime reflection on the
// exported singleton. Both branches are pure functions of their args.

import { describe, it, expect } from 'vitest';
import { piapiVideoService } from '../piapi-video-service';
import {
  providerSupportsNativeAudio,
  VIDEO_PROVIDER_CATALOG,
} from '../../../shared/provider-catalog';

const svc = piapiVideoService as any;

const baseT2V = (model: string, extras: Record<string, any> = {}) => ({
  prompt: 'a cinematic shot of a sunlit kitchen',
  duration: 8,
  aspectRatio: '16:9',
  model,
  ...extras,
});

const baseI2V = (model: string, extras: Record<string, any> = {}) => ({
  imageUrl: 'https://example.com/img.png',
  prompt: 'gentle camera push-in',
  duration: 8,
  aspectRatio: '16:9' as const,
  model,
  ...extras,
});

// buildI2VRequestBody takes (options, sanitizedPrompt). The second arg
// is the prompt that has already been run through provider-specific
// sanitization upstream — for our payload-shape tests, any non-empty
// string is fine.
const I2V_PROMPT = 'gentle camera push-in on the product';

describe('Seedance T2V payload — generate_audio is an explicit boolean', () => {
  for (const model of ['seedance-2.0', 'seedance-2.0-fast'] as const) {
    it(`emits generate_audio: false when flag is undefined (${model})`, () => {
      const body = svc.buildRequestBody(baseT2V(model), {});
      // Field is always present so we never inherit a server-side default.
      expect(body.input.generate_audio).toBe(false);
    });

    it(`emits generate_audio: false when flag is explicitly false (${model})`, () => {
      const body = svc.buildRequestBody(
        baseT2V(model, { generateNativeAudio: false }),
        {},
      );
      expect(body.input.generate_audio).toBe(false);
    });

    it(`emits generate_audio: true when flag is explicitly true (${model})`, () => {
      const body = svc.buildRequestBody(
        baseT2V(model, { generateNativeAudio: true }),
        {},
      );
      expect(body.input.generate_audio).toBe(true);
    });

    it(`always clamps duration into [4, 15] (${model})`, () => {
      const tooSmall = svc.buildRequestBody(baseT2V(model, { duration: 1 }), {});
      const tooBig = svc.buildRequestBody(baseT2V(model, { duration: 60 }), {});
      const inRange = svc.buildRequestBody(baseT2V(model, { duration: 10 }), {});
      expect(tooSmall.input.duration).toBe(4);
      expect(tooBig.input.duration).toBe(15);
      expect(inRange.input.duration).toBe(10);
    });
  }
});

describe('Seedance I2V payload — generate_audio is an explicit boolean', () => {
  // Both Seedance I2V branches (first_last_frames + omni_reference)
  // route through buildI2VRequestBody and read `generateAudio`.
  it('emits generate_audio: false when flag is undefined', () => {
    const body = svc.buildI2VRequestBody(baseI2V('seedance-2.0'), I2V_PROMPT);
    expect(body.input.generate_audio).toBe(false);
  });

  it('emits generate_audio: false when flag is explicitly false', () => {
    const body = svc.buildI2VRequestBody(
      baseI2V('seedance-2.0', { generateAudio: false }),
      I2V_PROMPT,
    );
    expect(body.input.generate_audio).toBe(false);
  });

  it('emits generate_audio: true when flag is true (seedance-2.0)', () => {
    const body = svc.buildI2VRequestBody(
      baseI2V('seedance-2.0', { generateAudio: true }),
      I2V_PROMPT,
    );
    expect(body.input.generate_audio).toBe(true);
  });

  it('emits generate_audio: true when flag is true (seedance-2.0-fast)', () => {
    const body = svc.buildI2VRequestBody(
      baseI2V('seedance-2.0-fast', { generateAudio: true }),
      I2V_PROMPT,
    );
    expect(body.input.generate_audio).toBe(true);
  });

  // Both Seedance I2V branches must clamp duration into [4, 15] — a
  // stale 30 s scene from before Phase 20D would otherwise reach PiAPI
  // and be rejected (or quietly truncated by the provider).
  it('always clamps duration into [4, 15] (omni_reference branch)', () => {
    const tooSmall = svc.buildI2VRequestBody(
      baseI2V('seedance-2.0', { duration: 1 }),
      I2V_PROMPT,
    );
    const tooBig = svc.buildI2VRequestBody(
      baseI2V('seedance-2.0', { duration: 60 }),
      I2V_PROMPT,
    );
    const inRange = svc.buildI2VRequestBody(
      baseI2V('seedance-2.0', { duration: 10 }),
      I2V_PROMPT,
    );
    expect(tooSmall.input.duration).toBe(4);
    expect(tooBig.input.duration).toBe(15);
    expect(inRange.input.duration).toBe(10);
    // Sanity-check we're actually exercising the omni_reference branch.
    expect(tooSmall.input.mode).toBe('omni_reference');
  });

  // The first_last_frames branch is reached when callers pass
  // `i2vSettings.useFirstLastFrames === true` (used by the Seamless
  // Transitions / Cinematic Flow path). It has its own payload shape
  // (mode='first_last_frames', aspect_ratio='auto', image_urls array)
  // and must independently honor both the audio flag and the clamp.
  it('first_last_frames branch emits generate_audio + clamps duration', () => {
    const flfOpts = baseI2V('seedance-2.0', {
      duration: 99,
      generateAudio: true,
      i2vSettings: { useFirstLastFrames: true },
    });
    const body = svc.buildI2VRequestBody(flfOpts, I2V_PROMPT);
    expect(body.input.mode).toBe('first_last_frames');
    expect(body.input.aspect_ratio).toBe('auto');
    expect(body.input.generate_audio).toBe(true);
    expect(body.input.duration).toBe(15);
  });

  it('first_last_frames branch defaults generate_audio to false when flag is undefined', () => {
    const body = svc.buildI2VRequestBody(
      baseI2V('seedance-2.0', { i2vSettings: { useFirstLastFrames: true } }),
      I2V_PROMPT,
    );
    expect(body.input.mode).toBe('first_last_frames');
    expect(body.input.generate_audio).toBe(false);
  });

  // Cross-provider gate (defense in depth): even if a stale
  // `generateAudio: true` ever reaches the I2V builder for a
  // non-Seedance model, only Veo I2V reads the field at all — and the
  // upstream gate in ai-video-service.ts already prevents it from
  // arriving for non-Seedance providers. This test guards that gate
  // by asserting the Seedance T2V/I2V builders never accidentally
  // mutate the flag for the wrong model.
  it('does not leak generate_audio onto seedance-1.0 (legacy I2V)', () => {
    const body = svc.buildI2VRequestBody(
      baseI2V('seedance-1.0', { generateAudio: true }),
      I2V_PROMPT,
    );
    expect(body.input.generate_audio).toBeUndefined();
  });
});

describe('ai-video-service generateAudio gate — catalog-driven (Tasks #126, #136)', () => {
  // The forwarding gate in ai-video-service.ts MUST NOT pass
  // generateAudio=true to providers that don't advertise native audio
  // in the shared provider catalog (Veo I2V is the dangerous one — it
  // reads options.generateAudio and would emit generate_audio:true to
  // Google's API).
  //
  // Task #136 made the provider catalog (shared/provider-catalog.ts)
  // the single source of truth via the `supportsNativeAudio` flag, so
  // we assert two things:
  //   1. The catalog correctly marks the audio-capable models.
  //   2. The ai-video-service gate reads from the catalog helper —
  //      not from a hardcoded model-string allowlist.
  it('catalog flag is set on Seedance 2 variants and not on dangerous neighbors', () => {
    // Positive: the models the runtime is currently routing audio to
    // must keep the flag — losing this would silently disable the UI.
    expect(providerSupportsNativeAudio('seedance-2.0')).toBe(true);
    expect(providerSupportsNativeAudio('seedance-2.0-fast')).toBe(true);
    // Negative spot-checks: these are the providers most likely to be
    // mis-flagged in a future edit. Veo I2V in particular reads
    // generate_audio downstream — flipping its flag would silently
    // start emitting audio requests to Google's API and bill the user.
    expect(providerSupportsNativeAudio('veo-3')).toBe(false);
    expect(providerSupportsNativeAudio('veo-3.1')).toBe(false);
    expect(providerSupportsNativeAudio('veo-2')).toBe(false);
    expect(providerSupportsNativeAudio('seedance-1.0')).toBe(false);
    expect(providerSupportsNativeAudio('kling-2.6')).toBe(false);
    expect(providerSupportsNativeAudio('runway-4.5')).toBe(false);
    expect(providerSupportsNativeAudio(undefined)).toBe(false);
    expect(providerSupportsNativeAudio('not-a-real-model')).toBe(false);
    // Sanity: at least one model is flagged. Adding a NEW audio-capable
    // model should NOT require editing this test — that's the whole
    // point of Task #136. We deliberately don't pin the exact set.
    const flagged = VIDEO_PROVIDER_CATALOG.filter(p => p.supportsNativeAudio === true);
    expect(flagged.length).toBeGreaterThanOrEqual(2);
  });

  it('ai-video-service gate uses the catalog helper, not a model-string allowlist', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('node:fs');
    const path = require('node:path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '..', 'ai-video-service.ts'),
      'utf8',
    );
    // The gate must read from the shared catalog helper.
    expect(src).toMatch(/providerSupportsNativeAudio\s*\(/);
    expect(src).toMatch(/generateNativeAudio === true/);
    // And it must NOT have reverted to a hardcoded model-string check.
    expect(src).not.toMatch(/providerKey === ['"]seedance-2\.0['"]/);
    expect(src).not.toMatch(/providerKey === ['"]seedance-2\.0-fast['"]/);
  });
});
