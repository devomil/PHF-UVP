/**
 * Pure helpers shared by CustomImageOverlay and CustomTextOverlay.
 *
 * These functions exist primarily so the timing / range-builder logic is
 * unit-testable without spinning up a Remotion render context. See
 * `__tests__/CustomImageOverlay.test.ts` for the regression suite that
 * covers the historical crash-class interpolation bugs.
 */

export interface OverlayWindowInput {
  /** Start time in seconds, relative to the parent sequence. */
  timingStart?: number;
  /** Visible duration in seconds. If undefined, fills the rest of the parent. */
  timingDuration?: number;
  /** Total parent duration in frames. */
  durationInFrames: number;
  /** Frames per second of the composition. */
  fps: number;
}

export interface OverlayWindow {
  startFrame: number;
  endFrame: number;
  /** Always >= 1, even for degenerate inputs. */
  localDuration: number;
}

/**
 * Resolve the visibility window (in frames) for an overlay given the user-facing
 * timingStart/timingDuration controls. Mirrors what each overlay component
 * computes inline.
 */
export function computeOverlayWindow({
  timingStart,
  timingDuration,
  durationInFrames,
  fps,
}: OverlayWindowInput): OverlayWindow {
  const startFrame = Math.max(0, Math.round((timingStart ?? 0) * fps));
  const visibleDuration = timingDuration != null
    ? Math.max(1, Math.round(timingDuration * fps))
    : durationInFrames - startFrame;
  const endFrame = Math.min(durationInFrames, startFrame + visibleDuration);
  const localDuration = Math.max(1, endFrame - startFrame);
  return { startFrame, endFrame, localDuration };
}

export interface SafeAnimationRangeInput {
  localDuration: number;
  /** Animation duration in seconds (one side, enter or exit). */
  animationDuration: number;
  fps: number;
}

export interface SafeAnimationRange {
  /** True when the visible window is too short to safely run a 4-keyframe interpolate. */
  tooShortForAnimation: boolean;
  /** Number of frames over which enter/exit animation should run. */
  animFrames: number;
  /** End-of-enter / start-of-hold keyframe (in local frames). */
  safeEnterEnd: number;
  /** End-of-hold / start-of-exit keyframe (in local frames). */
  safeExitStart: number;
}

/**
 * Build a strictly-monotonic 4-tuple of interpolate keyframes
 * `[0, safeEnterEnd, safeExitStart, localDuration]` that is safe to feed to
 * Remotion's `interpolate()` regardless of how degenerate the inputs are.
 *
 * Guarantees:
 *  - `0 < safeEnterEnd < safeExitStart < localDuration` whenever
 *    `tooShortForAnimation` is false.
 *  - When `tooShortForAnimation` is true the caller should skip animation
 *    entirely (the keyframes are still defined but should not be used).
 */
export function computeSafeAnimationRange({
  localDuration,
  animationDuration,
  fps,
}: SafeAnimationRangeInput): SafeAnimationRange {
  const tooShortForAnimation = localDuration < 4;

  const requestedAnimFrames = Math.max(1, Math.round(animationDuration * fps));
  const maxAnimFrames = Math.max(1, Math.floor((localDuration - 1) / 2));
  const animFrames = Math.max(1, Math.min(requestedAnimFrames, maxAnimFrames));

  const a = Math.min(animFrames, localDuration - 3);
  const b = Math.max(a + 1, localDuration - animFrames);
  const safeEnterEnd = Math.max(1, a);
  const safeExitStart = Math.min(localDuration - 1, Math.max(safeEnterEnd + 1, b));

  return { tooShortForAnimation, animFrames, safeEnterEnd, safeExitStart };
}

/**
 * Wrap policy applied to the body of every CustomTextOverlay. Centralized so
 * it can be snapshot-tested — these four properties together guarantee that
 * tokens like brand URLs ("PineHillFarm.co") never split mid-word at typical
 * lower-third widths. Loosening any of them is a regression.
 */
export const TEXT_OVERLAY_WRAP_STYLE = {
  wordBreak: 'keep-all',
  overflowWrap: 'normal',
  whiteSpace: 'pre-wrap',
  hyphens: 'manual',
} as const;
