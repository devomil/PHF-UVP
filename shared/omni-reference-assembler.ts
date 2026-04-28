// Phase 21B (Task #106): Deterministic priority rule for assembling the
// `image_urls` array sent to Seedance 2 omni_reference, plus the matching
// prompt rewrites.
//
// One pure function — `assembleOmniReferenceImages` — is the SINGLE source
// of truth for "what images, in what order, with what tags?" so the prompt
// preview UI (`buildOmniReferencePrompt`) and the runtime path
// (`piapi-video-service` / `universal-video-routes`) can never disagree.
//
// Priority (deterministic, top-down):
//
//   1. seedImageUrl present + brandReferences[] non-empty
//      ─ seed becomes @image1; original brandReferences shift to @image2..@imageN+1.
//      ─ Existing `@imageN` tokens in basePrompt are renumbered to `@image(N+1)`
//        so prompts authored against pre-Phase-21B numbering keep working.
//      ─ buildOmniReferencePrompt is then invoked on the shifted prompt with
//        the seed pinned at index 0.
//
//   2. seedImageUrl present + brandReferences[] empty
//      ─ Seed is the only ref. It becomes @image1. No prompt rewrite needed.
//      ─ buildOmniReferencePrompt is invoked with a single-item refs list so
//        the same noun-injection / append rules apply as the brand-only path.
//
//   3. seedImageUrl absent + brandReferences[] non-empty
//      ─ Untouched legacy Phase 20C path; just delegate to buildOmniReferencePrompt.
//
//   4. Neither
//      ─ Nothing to inject. Return the basePrompt verbatim with empty imageList.
//
// No I/O, no Date.now() — safe to unit-test exhaustively.

import type { Scene, BrandReferenceInput } from './video-types';
import { buildOmniReferencePrompt } from './omni-reference-prompt';

export type OmniReferenceMode = 'seed+refs' | 'seed-only' | 'refs-only' | 'none';

export interface AssemblyInput {
  basePrompt: string;
  /** Resolved (public, signed) URL for the scene's seed image, or null when absent. */
  seedImageUrl?: string | null;
  /** Resolved BrandReferenceInput entries. Order is preserved. */
  references: BrandReferenceInput[];
}

export interface AssemblyResult {
  prompt: string;
  imageList: string[];
  mode: OmniReferenceMode;
  /** True when at least one `@imageN` token in basePrompt was renumbered. */
  promptShifted: boolean;
  /**
   * Map of `@imageN` token → resolved URL, in slot order. Lets callers (and
   * logs) trace exactly which image landed at which tag without re-deriving
   * the order from `imageList`.
   */
  tagMap: Record<string, string>;
  /**
   * The list of token rewrites applied to the prompt when a seed image is
   * promoted to `@image1`. Empty when no shift occurred.
   */
  promptRewrites: Array<{ from: string; to: string }>;
}

/**
 * Renumber every `@imageN` token in `prompt` to `@image(N+offset)`.
 * Used when a seed image is prepended at @image1, so all existing tags must
 * shift up by 1.
 *
 * Higher numbers are rewritten first to avoid double-shifting (e.g. shifting
 * @image1 → @image2 then re-matching that fresh @image2 → @image3).
 */
export function shiftImageTags(prompt: string, offset: number): string {
  if (!prompt) return '';
  if (offset === 0) return prompt;
  const matches = Array.from(prompt.matchAll(/@image(\d+)/gi));
  if (matches.length === 0) return prompt;

  // Sort descending by index so we never re-match a freshly-rewritten token.
  const indices = Array.from(new Set(matches.map(m => parseInt(m[1], 10))))
    .filter(n => Number.isFinite(n))
    .sort((a, b) => b - a);

  let out = prompt;
  for (const n of indices) {
    const re = new RegExp(`@image${n}\\b`, 'gi');
    out = out.replace(re, `@image${n + offset}`);
  }
  return out;
}

/**
 * Assemble the final image_urls array + prompt for Seedance 2 omni_reference.
 * See file header for the priority rule. Pure function.
 */
export function assembleOmniReferenceImages(input: AssemblyInput): AssemblyResult {
  const basePrompt = (input.basePrompt ?? '').toString();
  const seedUrl = input.seedImageUrl && typeof input.seedImageUrl === 'string'
    ? input.seedImageUrl.trim()
    : '';
  const refs = (input.references ?? []).filter(r => r && typeof r.assetUrl === 'string' && r.assetUrl.length > 0);

  const hasSeed = seedUrl.length > 0;
  const hasRefs = refs.length > 0;

  // Helper to derive a `tagMap` from a renumbered references list, so callers
  // can trace which URL landed at which @imageN slot.
  const buildTagMap = (renumbered: BrandReferenceInput[]): Record<string, string> => {
    const m: Record<string, string> = {};
    for (const r of renumbered) {
      const tag = `@${r.tag || ''}`.replace(/^@@/, '@');
      if (tag !== '@' && r.assetUrl) m[tag] = r.assetUrl;
    }
    return m;
  };

  // Branch 4 — nothing to inject.
  if (!hasSeed && !hasRefs) {
    return {
      prompt: basePrompt,
      imageList: [],
      mode: 'none',
      promptShifted: false,
      tagMap: {},
      promptRewrites: [],
    };
  }

  // Branch 3 — legacy Phase 20C path.
  if (!hasSeed && hasRefs) {
    const omni = buildOmniReferencePrompt({ basePrompt, references: refs });
    return {
      prompt: omni.prompt,
      imageList: omni.imageList,
      mode: 'refs-only',
      promptShifted: false,
      tagMap: buildTagMap(refs),
      promptRewrites: [],
    };
  }

  // Branch 2 — seed only. Treat the seed as a single brand reference so the
  // existing prompt-tagging logic (noun-injection / append) covers us.
  if (hasSeed && !hasRefs) {
    const seedRef: BrandReferenceInput = { assetUrl: seedUrl, tag: 'image1', label: 'seed' };
    const omni = buildOmniReferencePrompt({ basePrompt, references: [seedRef] });
    return {
      prompt: omni.prompt,
      imageList: omni.imageList,
      mode: 'seed-only',
      promptShifted: false,
      tagMap: buildTagMap([seedRef]),
      promptRewrites: [],
    };
  }

  // Branch 1 — seed + refs. Shift existing @imageN tokens by +1, prepend the
  // seed, then renumber refs to image2..image(N+1).
  const tagsBeforeShift = (basePrompt.match(/@image\d+/gi) || []) as string[];
  const matchesBeforeShift = tagsBeforeShift.length > 0;
  const shiftedPrompt = matchesBeforeShift ? shiftImageTags(basePrompt, 1) : basePrompt;

  // Compute the from→to rewrites so callers can audit the shift.
  const promptRewrites: Array<{ from: string; to: string }> = matchesBeforeShift
    ? Array.from(new Set(tagsBeforeShift.map(t => t.toLowerCase()))).map(from => {
        const n = parseInt(from.replace(/@image/i, ''), 10);
        return { from, to: `@image${n + 1}` };
      })
    : [];

  const renumberedRefs: BrandReferenceInput[] = [
    { assetUrl: seedUrl, tag: 'image1', label: 'seed' },
    ...refs.map((r, i) => ({ ...r, tag: `image${i + 2}` })),
  ];

  const omni = buildOmniReferencePrompt({
    basePrompt: shiftedPrompt,
    references: renumberedRefs,
  });

  return {
    prompt: omni.prompt,
    imageList: omni.imageList,
    mode: 'seed+refs',
    promptShifted: matchesBeforeShift,
    tagMap: buildTagMap(renumberedRefs),
    promptRewrites,
  };
}

/**
 * Convenience wrapper that takes a Scene and an optional pre-resolved
 * references list. The caller is responsible for resolving URLs (the
 * universal-video-routes I2V path already does sign + AR-pad).
 */
export function assembleOmniReferenceImagesForScene(
  scene: Pick<Scene, 'brandReferences'> & { seedImageUrl?: string },
  options: { basePrompt: string; resolvedReferences?: BrandReferenceInput[] }
): AssemblyResult {
  const refs = options.resolvedReferences ?? (scene.brandReferences ?? []);
  return assembleOmniReferenceImages({
    basePrompt: options.basePrompt,
    seedImageUrl: scene.seedImageUrl,
    references: refs,
  });
}
