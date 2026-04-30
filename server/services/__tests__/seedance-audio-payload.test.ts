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

describe('Seedance T2V payload — generate_audio is opt-in', () => {
  for (const model of ['seedance-2.0', 'seedance-2.0-fast'] as const) {
    it(`omits generate_audio when generateNativeAudio is undefined (${model})`, () => {
      const body = svc.buildRequestBody(baseT2V(model), {});
      expect(body.input.generate_audio).toBeUndefined();
    });

    it(`omits generate_audio when generateNativeAudio is false (${model})`, () => {
      const body = svc.buildRequestBody(
        baseT2V(model, { generateNativeAudio: false }),
        {},
      );
      expect(body.input.generate_audio).toBeUndefined();
    });

    it(`emits generate_audio: true when explicitly opted in (${model})`, () => {
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

describe('Seedance I2V payload — generate_audio is opt-in', () => {
  // Both Seedance I2V branches (first_last_frames + omni_reference)
  // route through buildI2VRequestBody and read `generateAudio`.
  it('omits generate_audio when flag is undefined', () => {
    const body = svc.buildI2VRequestBody(baseI2V('seedance-2.0'), I2V_PROMPT);
    // The Seedance I2V branch may include other params; the only
    // contract is that `generate_audio: true` is NOT present unless
    // we asked for it.
    expect(body.input.generate_audio).not.toBe(true);
  });

  it('omits generate_audio when flag is false', () => {
    const body = svc.buildI2VRequestBody(
      baseI2V('seedance-2.0', { generateAudio: false }),
      I2V_PROMPT,
    );
    expect(body.input.generate_audio).not.toBe(true);
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
});
