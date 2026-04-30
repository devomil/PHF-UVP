// Client-side mirror of server/utils/duration.ts.
//
// Kept tiny and inlined here (rather than imported from server/) to avoid
// pulling server-only modules into the browser bundle. Both the slider
// readout and the bulk-action popover read these bounds — keep them in
// lockstep with the server helper, including the "invalid input -> default"
// fallback so optimistic UI never disagrees with the persisted value.

export const SEEDANCE_2_MIN_DURATION = 4;
export const SEEDANCE_2_MAX_DURATION = 15;
// Mid-range default used when the input is missing or invalid (NaN, 0,
// null, undefined, ±Infinity, non-numeric). Mirrors
// `SEEDANCE_2_DEFAULT_DURATION` on the server so a stale 0/undefined
// value renders as "8s" everywhere instead of snapping to the lower
// bound.
export const SEEDANCE_2_DEFAULT_DURATION = 8;

export function clampSeedance2Duration(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return SEEDANCE_2_DEFAULT_DURATION;
  if (n === 0) return SEEDANCE_2_DEFAULT_DURATION;
  const rounded = Math.round(n);
  if (rounded < SEEDANCE_2_MIN_DURATION) return SEEDANCE_2_MIN_DURATION;
  if (rounded > SEEDANCE_2_MAX_DURATION) return SEEDANCE_2_MAX_DURATION;
  return rounded;
}
