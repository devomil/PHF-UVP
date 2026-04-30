// Phase 20D (Task #126): scene-duration helpers for Seedance 2.
//
// PiAPI's Seedance 2 / Seedance 2 Fast models accept `duration` between
// 4 and 15 seconds inclusive. Outside that range the request 400s. To
// keep the UI slider, the bulk-action popover, and the request payload
// builder all in agreement on the same bounds, both pieces use these
// helpers as the single source of truth.

export const SEEDANCE_2_MIN_DURATION = 4;
export const SEEDANCE_2_MAX_DURATION = 15;

/**
 * Clamp an arbitrary numeric duration into the Seedance 2 valid range.
 * Non-finite or non-numeric input falls back to the lower bound (the
 * model rejects anything below 4s, so the lower bound is the safest
 * recovery — it returns a 4-second clip rather than a 400 error).
 */
export function clampSeedance2Duration(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  // NaN / non-numeric → safest default (request still succeeds at min).
  if (Number.isNaN(n)) return SEEDANCE_2_MIN_DURATION;
  // ±Infinity → snap to the matching bound rather than the safe default.
  // The intent of "clamp" is "drag into range", and a callers passing
  // `Infinity` means "as large as possible".
  if (n === Number.POSITIVE_INFINITY) return SEEDANCE_2_MAX_DURATION;
  if (n === Number.NEGATIVE_INFINITY) return SEEDANCE_2_MIN_DURATION;
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
