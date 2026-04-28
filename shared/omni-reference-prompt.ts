// Phase 20C: Prompt builder for Seedance 2 omni_reference mode.
//
// Lives in `shared/` so both the runtime generation path (server) and the
// "Final prompt to Seedance 2" preview (client) call the same logic — there is
// no duplicate string-rewriting elsewhere.
//
// Contract:
// - basePrompt: the user-edited scene prompt (videoPrompt / visualDirection).
// - references: ordered list of brand reference inputs. Index 0 → @image1, etc.
// Returns:
// - prompt: tagged prompt string ready to send to PiAPI.
// - imageList: ordered URLs to send as `image_urls` (Seedance 2 omni_reference).
// - usedTags: which @imageN tokens are present in the returned prompt (for the
//   reference health linter).
// - injectedTag: 'preserved' | 'noun-replaced' | 'appended' | 'none' — for logs/UI hints.
//
// No I/O, no logging side effects beyond a single optional console.log when
// `verbose` is true. Pure function — safe to unit test.

import type { BrandReferenceInput } from './video-types';

export interface OmniReferencePromptResult {
  prompt: string;
  imageList: string[];
  usedTags: string[];
  injectedTag: 'preserved' | 'noun-replaced' | 'appended' | 'none';
}

const PRODUCT_NOUNS: readonly string[] = [
  'supplement bottle',
  'bottle',
  'supplement',
  'product',
  'package',
  'container',
  'jar',
  'tube',
  'pouch',
  'box',
  'can',
];

const TAG_REGEX = /@image(\d+)/gi;

function findUsedTags(prompt: string): string[] {
  const seen = new Set<string>();
  for (const match of prompt.matchAll(TAG_REGEX)) {
    seen.add(`image${match[1]}`);
  }
  return Array.from(seen);
}

export function buildOmniReferencePrompt(params: {
  basePrompt: string;
  references: BrandReferenceInput[];
  verbose?: boolean;
}): OmniReferencePromptResult {
  const basePrompt = (params.basePrompt ?? '').toString();
  const references = params.references ?? [];

  if (references.length === 0) {
    return {
      prompt: basePrompt,
      imageList: [],
      usedTags: findUsedTags(basePrompt),
      injectedTag: 'none',
    };
  }

  const imageList = references
    .map((r) => r.assetUrl)
    .filter((u): u is string => !!u && typeof u === 'string');

  // Pre-tagged: leave as-is, but ONLY if the primary anchor `@image1` is
  // already present (per spec). Prompts that mention only `@image2` (etc.)
  // without `@image1` are NOT considered correctly anchored — they fall
  // through to noun-injection / append so the model always receives the
  // primary product anchor.
  if (/@image1\b/i.test(basePrompt)) {
    if (params.verbose) console.log('[OmniRef] Using pre-tagged prompt (@image1 present)');
    return {
      prompt: basePrompt,
      imageList,
      usedTags: findUsedTags(basePrompt),
      injectedTag: 'preserved',
    };
  }

  // Try noun replacement (case-insensitive, longest noun first to prefer
  // "supplement bottle" over "bottle" or "supplement").
  let modifiedPrompt = basePrompt;
  let injected: 'noun-replaced' | 'appended' = 'appended';
  for (const noun of PRODUCT_NOUNS) {
    const escaped = noun.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    if (regex.test(modifiedPrompt)) {
      modifiedPrompt = modifiedPrompt.replace(regex, '@image1');
      injected = 'noun-replaced';
      if (params.verbose) console.log(`[OmniRef] Injected @image1 at noun: "${noun}"`);
      break;
    }
  }

  if (injected === 'appended') {
    const trimmed = modifiedPrompt.trimEnd();
    const needsPeriod = trimmed.length > 0 && !/[.!?]$/.test(trimmed);
    modifiedPrompt = `${trimmed}${needsPeriod ? '.' : ''} Product: @image1.`;
    if (params.verbose) console.log('[OmniRef] No product noun found — appended @image1');
  }

  return {
    prompt: modifiedPrompt,
    imageList,
    usedTags: findUsedTags(modifiedPrompt),
    injectedTag: injected,
  };
}

// Linter helpers used by the UI to surface dangling / unused tags.
export interface ReferenceHealthIssue {
  kind: 'dangling-tag' | 'unused-reference';
  /** For dangling-tag: the tag (e.g. "image3") that has no matching reference.
   *  For unused-reference: the tag (e.g. "image2") that's attached but absent. */
  tag: string;
}

export function analyzeReferenceHealth(params: {
  prompt: string;
  references: BrandReferenceInput[];
}): ReferenceHealthIssue[] {
  const used = new Set(findUsedTags(params.prompt));
  const attachedTags = new Set(params.references.map((r) => r.tag));
  const issues: ReferenceHealthIssue[] = [];

  for (const tag of used) {
    if (!attachedTags.has(tag)) {
      issues.push({ kind: 'dangling-tag', tag });
    }
  }
  for (const tag of attachedTags) {
    if (!used.has(tag)) {
      issues.push({ kind: 'unused-reference', tag });
    }
  }
  return issues;
}
