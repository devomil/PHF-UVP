// Phase 20D (Task #126): scene defaults derived from project visual style.
//
// Used at scene-creation time (script-parser, script-pipeline,
// custom-script seeding) to seed a sensible per-scene `duration` based
// on the project's visual style. Today this only covers duration; the
// helper exists in `shared/` so both the server creation paths and the
// client "Scene defaults" popover read the same numbers.

const STYLE_DEFAULT_DURATION_SECONDS: Record<string, number> = {
  social: 5,        // fast-paced TikTok / Reels
  lifestyle: 8,     // conversational pacing
  product: 8,       // measured product reveals
  educational: 10,  // explainer beats with comprehension time
  hero: 12,         // cinematic dramatic pacing
  premium: 12,      // luxurious slow timing
};

/** Fallback when the style is unknown / unmapped. Matches the previous
 *  hard-coded `|| 8` default that lived in the script-pipeline writer
 *  so this change is opt-in for known styles only. */
export const SCENE_DEFAULT_DURATION_FALLBACK = 8;

/**
 * Returns the default scene duration (in seconds) appropriate for the
 * given visual-style id. Unknown / missing style ids fall back to
 * SCENE_DEFAULT_DURATION_FALLBACK. The lookup is case-insensitive.
 */
export function getDefaultDurationForStyle(styleId: string | null | undefined): number {
  if (!styleId) return SCENE_DEFAULT_DURATION_FALLBACK;
  const key = String(styleId).toLowerCase();
  const mapped = STYLE_DEFAULT_DURATION_SECONDS[key];
  return typeof mapped === 'number' ? mapped : SCENE_DEFAULT_DURATION_FALLBACK;
}
