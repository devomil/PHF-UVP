// Phase 20D (Task #126): client-side mirror of server/utils/duration.ts.
//
// Kept tiny and inlined here (rather than imported from server/) to avoid
// pulling server-only modules into the browser bundle. Both the slider
// readout and the bulk-action popover read these bounds — keep them in
// lockstep with the server helper.

export const SEEDANCE_2_MIN_DURATION = 4;
export const SEEDANCE_2_MAX_DURATION = 15;

export function clampSeedance2Duration(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return SEEDANCE_2_MIN_DURATION;
  const rounded = Math.round(n);
  if (rounded < SEEDANCE_2_MIN_DURATION) return SEEDANCE_2_MIN_DURATION;
  if (rounded > SEEDANCE_2_MAX_DURATION) return SEEDANCE_2_MAX_DURATION;
  return rounded;
}
