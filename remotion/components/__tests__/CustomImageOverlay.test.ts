import { describe, expect, it } from 'vitest';
import {
  computeOverlayWindow,
  computeSafeAnimationRange,
} from '../overlay-utils';

const FPS = 30;

/**
 * Asserts the four interpolate keyframes are strictly monotonically
 * increasing — this is what Remotion's `interpolate()` requires, and
 * violating it is the root cause of the historical "crash on tiny
 * overlay duration" bug.
 */
function expectStrictlyMonotonic(
  range: ReturnType<typeof computeSafeAnimationRange>,
  localDuration: number,
) {
  const tuple = [0, range.safeEnterEnd, range.safeExitStart, localDuration];
  for (let i = 1; i < tuple.length; i++) {
    expect(
      tuple[i] > tuple[i - 1],
      `expected ${tuple[i]} > ${tuple[i - 1]} in [${tuple.join(', ')}] (localDuration=${localDuration})`,
    ).toBe(true);
  }
}

describe('computeSafeAnimationRange', () => {
  describe('1-3 frame visibility windows are flagged as too short', () => {
    for (const localDuration of [1, 2, 3]) {
      it(`localDuration=${localDuration} → tooShortForAnimation`, () => {
        const r = computeSafeAnimationRange({
          localDuration,
          animationDuration: 0.4,
          fps: FPS,
        });
        expect(r.tooShortForAnimation).toBe(true);
      });
    }
  });

  describe('localDuration === 4 is the minimum animatable window', () => {
    it('produces a safe strictly-monotonic 4-tuple', () => {
      const localDuration = 4;
      const r = computeSafeAnimationRange({
        localDuration,
        animationDuration: 0.4,
        fps: FPS,
      });
      expect(r.tooShortForAnimation).toBe(false);
      expectStrictlyMonotonic(r, localDuration);
    });
  });

  describe('larger windows stay safe across animationDuration values', () => {
    const animationDurations = [0.1, 0.4, 5];
    for (const animationDuration of animationDurations) {
      it(`localDuration=30 frames, animationDuration=${animationDuration}s`, () => {
        const localDuration = 30;
        const r = computeSafeAnimationRange({
          localDuration,
          animationDuration,
          fps: FPS,
        });
        expect(r.tooShortForAnimation).toBe(false);
        expectStrictlyMonotonic(r, localDuration);
      });
    }

    it('animationDuration much larger than localDuration is clamped, not crashed', () => {
      // 5s of animation requested into a 4-frame window — must not produce
      // negative or non-monotonic keyframes.
      const localDuration = 4;
      const r = computeSafeAnimationRange({
        localDuration,
        animationDuration: 5,
        fps: FPS,
      });
      expect(r.tooShortForAnimation).toBe(false);
      expectStrictlyMonotonic(r, localDuration);
      expect(r.animFrames).toBeGreaterThanOrEqual(1);
    });
  });

  describe('matrix: every duration × every animationDuration stays safe', () => {
    const durations = [4, 5, 6, 10, 30, 90, 300];
    const animationDurations = [0.1, 0.4, 1, 2, 5];
    for (const localDuration of durations) {
      for (const animationDuration of animationDurations) {
        it(`localDuration=${localDuration}, animationDuration=${animationDuration}s`, () => {
          const r = computeSafeAnimationRange({
            localDuration,
            animationDuration,
            fps: FPS,
          });
          expect(r.tooShortForAnimation).toBe(false);
          expectStrictlyMonotonic(r, localDuration);
          expect(r.safeEnterEnd).toBeGreaterThanOrEqual(1);
          expect(r.safeExitStart).toBeLessThanOrEqual(localDuration - 1);
        });
      }
    }
  });
});

describe('computeOverlayWindow', () => {
  describe('timingStart = 0', () => {
    it('aligned to the start of the parent sequence', () => {
      const w = computeOverlayWindow({
        timingStart: 0,
        timingDuration: 1,
        durationInFrames: 90,
        fps: FPS,
      });
      expect(w.startFrame).toBe(0);
      expect(w.endFrame).toBe(30);
      expect(w.localDuration).toBe(30);
    });

    it('omitted timingDuration fills the rest of the parent', () => {
      const w = computeOverlayWindow({
        timingStart: 0,
        timingDuration: undefined,
        durationInFrames: 90,
        fps: FPS,
      });
      expect(w.startFrame).toBe(0);
      expect(w.endFrame).toBe(90);
      expect(w.localDuration).toBe(90);
    });
  });

  describe('timingStart near end of scene', () => {
    it('clamps endFrame to the parent duration', () => {
      // Scene is 90 frames (3s @ 30fps); start the overlay 2.95s in for 1s.
      // The overlay should clip to the remaining frames, never overshoot.
      const w = computeOverlayWindow({
        timingStart: 2.95,
        timingDuration: 1,
        durationInFrames: 90,
        fps: FPS,
      });
      expect(w.startFrame).toBeLessThanOrEqual(90);
      expect(w.endFrame).toBe(90);
      expect(w.localDuration).toBeGreaterThanOrEqual(1);
    });

    it('start past the end yields a degenerate, but non-zero, window', () => {
      // Pathological: start beyond the parent sequence. Must not crash and
      // must yield localDuration >= 1 so downstream callers stay safe.
      const w = computeOverlayWindow({
        timingStart: 5,
        timingDuration: 1,
        durationInFrames: 90,
        fps: FPS,
      });
      expect(w.localDuration).toBeGreaterThanOrEqual(1);
      expect(w.startFrame).toBeGreaterThanOrEqual(0);
    });

    it('start at the very last frame still produces a safe window', () => {
      const w = computeOverlayWindow({
        timingStart: 89 / FPS,
        timingDuration: 0.1,
        durationInFrames: 90,
        fps: FPS,
      });
      expect(w.startFrame).toBe(89);
      expect(w.endFrame).toBe(90);
      expect(w.localDuration).toBe(1);
    });
  });

  describe('end-to-end: window + safe range stay coherent', () => {
    it('1-frame window near end of scene → tooShortForAnimation', () => {
      const w = computeOverlayWindow({
        timingStart: 89 / FPS,
        timingDuration: 0.1,
        durationInFrames: 90,
        fps: FPS,
      });
      const r = computeSafeAnimationRange({
        localDuration: w.localDuration,
        animationDuration: 0.4,
        fps: FPS,
      });
      expect(r.tooShortForAnimation).toBe(true);
    });

    it('full-scene window with default 0.4s animation produces safe keyframes', () => {
      const w = computeOverlayWindow({
        timingStart: 0,
        timingDuration: undefined,
        durationInFrames: 90,
        fps: FPS,
      });
      const r = computeSafeAnimationRange({
        localDuration: w.localDuration,
        animationDuration: 0.4,
        fps: FPS,
      });
      expect(r.tooShortForAnimation).toBe(false);
      expectStrictlyMonotonic(r, w.localDuration);
    });
  });
});
