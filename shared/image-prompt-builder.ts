// Phase 21B (Task #106): Pure helper that turns a Scene + optional art preset
// into the exact prompt string we send to NB2 (and to Recraft/Flux fallbacks)
// when generating storyboard / seed images.
//
// Design contract (kept narrow on purpose so it stays unit-testable):
//
//   1. Choose the BEST source string from the scene, in this order:
//        scene.imagePrompt → scene.visualDirection → scene.narration
//      The first non-empty wins. (`imagePrompt` is set by the storyboard
//      planner; `visualDirection` is the user-edited brief field; `narration`
//      is the last-resort fallback so we never send an empty string.)
//
//   2. Strip motion / temporal words. NB2, Recraft, and Flux are STILL-IMAGE
//      models — words like "slowly pans", "zooms in", "the camera moves",
//      "transitions to" are at best ignored and at worst hallucinated as
//      visible motion-blur artifacts. We replace them with neutral
//      composition language.
//
//   3. Apply the preset's `imagePromptPrefix` and `imagePromptSuffix` so the
//      whole batch shares one art direction.
//
// Pure function, no I/O, no Date.now() — call it from anywhere.

import type { Scene } from './video-types';

export interface VisualPresetLike {
  imagePromptPrefix?: string;
  imagePromptSuffix?: string;
}

export interface BuildSceneImagePromptOptions {
  preset?: VisualPresetLike | null;
  /** Optional extra suffix appended after the preset suffix (e.g. quality tag). */
  trailingTag?: string;
}

// Ordered: longest phrase first so "slowly zooms in" matches before "zooms in".
const MOTION_REPLACEMENTS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bthe camera (slowly|quickly|gradually) (pans|zooms|moves|tilts|tracks|dollies)[^.,;]*/gi, 'composition shows'],
  [/\bcamera (slowly|quickly|gradually) (pans|zooms|moves|tilts|tracks|dollies)[^.,;]*/gi, 'composition shows'],
  [/\b(slow|fast|gradual)ly (pans|zooms|moves|tilts|tracks|dollies)[^.,;]*/gi, ''],
  [/\bcamera (pans|zooms|moves|tilts|tracks|dollies)[^.,;]*/gi, 'composition shows'],
  [/\b(pans|zooms|tilts|tracks|dollies) (in|out|left|right|up|down)\b/gi, ''],
  [/\b(zoom|pan|tilt|track|dolly) (in|out|left|right|up|down)\b/gi, ''],
  [/\btransitions? (to|into|from)\b/gi, 'shows'],
  [/\b(then|next|finally|afterwards),?\s+/gi, ''],
  [/\bover (\d+) seconds?\b/gi, ''],
  [/\bin slow motion\b/gi, ''],
  [/\bslow[- ]?motion\b/gi, ''],
  [/\btime[- ]?lapse\b/gi, ''],
  [/\bcuts? to\b/gi, 'showing'],
  [/\bfades? (in|out|to)\b/gi, ''],
  [/\bmoving (forward|backward|left|right|towards|toward|away)\b/gi, ''],
];

export function stripMotionWords(input: string): string {
  let out = input;
  for (const [regex, replacement] of MOTION_REPLACEMENTS) {
    out = out.replace(regex, replacement);
  }
  // Collapse double spaces / orphaned punctuation introduced by deletions.
  out = out
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;])/g, '$1')
    .replace(/([,.;]){2,}/g, '$1')
    .replace(/^[,.;\s]+/, '')
    .trim();
  return out;
}

function pickBaseText(scene: Partial<Pick<Scene, 'narration' | 'visualDirection'>> & { imagePrompt?: string }): string {
  const candidates = [scene.imagePrompt, scene.visualDirection, scene.narration];
  for (const c of candidates) {
    const v = (c ?? '').toString().trim();
    if (v.length > 0) return v;
  }
  return '';
}

export function buildSceneImagePrompt(
  scene: Partial<Pick<Scene, 'narration' | 'visualDirection'>> & { imagePrompt?: string },
  options: BuildSceneImagePromptOptions = {}
): string {
  const base = pickBaseText(scene);
  if (!base) return '';

  const stripped = stripMotionWords(base);
  const prefix = (options.preset?.imagePromptPrefix ?? '').trim();
  const suffix = (options.preset?.imagePromptSuffix ?? '').trim();
  const trailing = (options.trailingTag ?? '').trim();

  const parts: string[] = [];
  if (prefix) parts.push(prefix);
  parts.push(stripped);
  if (suffix) parts.push(suffix);
  if (trailing) parts.push(trailing);

  return parts.join(', ').replace(/\s{2,}/g, ' ').trim();
}
