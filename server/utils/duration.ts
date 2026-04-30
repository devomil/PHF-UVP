// Phase 20D (Task #126): scene-duration helpers for Seedance 2.
//
// PiAPI's Seedance 2 / Seedance 2 Fast models accept `duration` between
// 4 and 15 seconds inclusive. Outside that range the request 400s. To
// keep the UI slider, the bulk-action popover, and the request payload
// builder all in agreement on the same bounds, all surfaces use these
// helpers as the single source of truth.

export const SEEDANCE_2_MIN_DURATION = 4;
export const SEEDANCE_2_MAX_DURATION = 15;

/**
 * Sensible mid-range default used when input is missing or invalid.
 * Chosen so callers that pass `null`, `undefined`, `NaN`, `0`, or a
 * non-numeric value still get a usable scene length (8s sits comfortably
 * in the typical 5-12s sweet spot for both models).
 */
export const SEEDANCE_2_DEFAULT_DURATION = 8;

/**
 * Clamp an arbitrary numeric duration into the Seedance 2 valid range.
 *
 * Behavior:
 *   - `NaN`, `null`, `undefined`, non-numeric strings, or `0` → `8` (the
 *     "I have no real value" fallback).
 *   - `±Infinity` → `8` (treated as invalid, not as a clamp target — the
 *     caller almost never wants the absolute max for a scene duration).
 *   - Any other finite number → rounded to the nearest integer and then
 *     clamped into [4, 15].
 */
export function clampSeedance2Duration(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  // NaN / ±Infinity / non-numeric → safe mid-range default.
  if (!Number.isFinite(n)) return SEEDANCE_2_DEFAULT_DURATION;
  // Treat 0 as "missing" — same fallback as null/undefined so callers
  // can pass `scene.duration ?? 0` without surprise.
  if (n === 0) return SEEDANCE_2_DEFAULT_DURATION;
  // Round to whole seconds — PiAPI rejects fractional values.
  const rounded = Math.round(n);
  if (rounded < SEEDANCE_2_MIN_DURATION) return SEEDANCE_2_MIN_DURATION;
  if (rounded > SEEDANCE_2_MAX_DURATION) return SEEDANCE_2_MAX_DURATION;
  return rounded;
}

/**
 * Strict validator: returns true only if the input is already a whole
 * number inside the Seedance 2 range. Useful for unit tests and route
 * handlers that want to surface a 400 instead of silently clamping.
 */
export function isValidSeedance2Duration(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= SEEDANCE_2_MIN_DURATION &&
    value <= SEEDANCE_2_MAX_DURATION
  );
}
