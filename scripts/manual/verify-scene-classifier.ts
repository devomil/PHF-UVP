// Phase 23A (Task #118): Manual verification script for the Claude Haiku
// scene classifier. Hits the live Anthropic API with five hand-crafted
// scenes that should each map to a distinct `renderSystemType`. Hard-fails
// when ANTHROPIC_API_KEY is missing — otherwise the neutral fallback would
// give every scene the same `ai_video` answer and falsely "pass" 4/5.
//
// Usage: `npx tsx scripts/manual/verify-scene-classifier.ts`
//
// Exit codes:
//   0 — every scene classified correctly (or with a sensible alternate)
//   1 — at least one scene came back with an unexpected type, or env was
//       not configured

import {
  classifyScene,
  SCENE_CLASSIFIER_MODEL,
  type ClassifierResult,
} from '../../server/services/scene-classifier.service';
import type { RenderSystemType } from '../../shared/video-types';

interface VerifyCase {
  label: string;
  expected: RenderSystemType;
  /** Other types we'll grudgingly accept (e.g. ai_video for a scene that
   *  is reasonably ambiguous). Empty = strict expected only. */
  alternates?: RenderSystemType[];
  scene: {
    sceneId: string;
    sceneType?: string;
    narration?: string;
    visualDirection?: string;
  };
}

const CASES: VerifyCase[] = [
  {
    label: 'Title card — explicit chapter title',
    expected: 'title_card',
    scene: {
      sceneId: 'verify_title',
      sceneType: 'intro',
      narration: 'Welcome to Pine Hill Farm. Episode One: The Soil.',
      visualDirection:
        'Centered serif title text on a clean cream background. Small farm icon below the title. No motion, no people, no products.',
    },
  },
  {
    label: 'Infographic — stat callout with comparison',
    expected: 'infographic',
    alternates: ['scientific_medical'],
    scene: {
      sceneId: 'verify_infographic',
      sceneType: 'proof',
      narration:
        'Eighty-seven percent of customers reported smoother skin within four weeks.',
      visualDirection:
        'Animated horizontal bar chart with a large 87% callout, comparison ticks at 25/50/75/100, brand colors',
    },
  },
  {
    label: 'Scientific / medical — anatomical diagram',
    expected: 'scientific_medical',
    alternates: ['infographic'],
    scene: {
      sceneId: 'verify_medical',
      sceneType: 'explanation',
      narration:
        'CBD interacts with the endocannabinoid system, binding to CB1 receptors throughout the central nervous system.',
      visualDirection:
        'Cross-section diagram of a neuron with labeled CB1 receptors, molecular structure of CBD beside it, clinical illustration style',
    },
  },
  {
    label: 'Brand environment — branded storefront / shelf',
    expected: 'brand_environment',
    alternates: ['ai_video'],
    scene: {
      sceneId: 'verify_brand_env',
      sceneType: 'product',
      narration: 'Find Pine Hill Farm products at your local co-op.',
      visualDirection:
        'Wide shot inside a natural-foods grocery aisle. Pine Hill Farm signage prominent above the shelf. Branded packaging visible at eye level. Soft warm light, no people in frame.',
    },
  },
  {
    label: 'Product showcase — hero shot of single SKU',
    expected: 'product_showcase',
    alternates: ['ai_video'],
    scene: {
      sceneId: 'verify_product',
      sceneType: 'product',
      narration: 'Introducing our new full-spectrum tincture.',
      visualDirection:
        'Macro hero shot of a single amber dropper bottle on dark stone, slow 360 rotation, dramatic side lighting, droplet of oil hanging from the dropper, no humans, no environment',
    },
  },
];

function fmt(r: ClassifierResult): string {
  return `${r.renderSystemType} (conf=${r.confidence.toFixed(2)})  ${r.reasoning}`;
}

async function main(): Promise<number> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(
      '[verify-scene-classifier] ANTHROPIC_API_KEY is not set. Without it, every scene will fall back to "ai_video" and the script would falsely report 1/5 passing. Aborting.',
    );
    return 1;
  }

  console.log(`[verify-scene-classifier] model=${SCENE_CLASSIFIER_MODEL}`);
  console.log(`[verify-scene-classifier] running ${CASES.length} cases...`);

  let pass = 0;
  let acceptable = 0;
  let fail = 0;

  for (const c of CASES) {
    const result = await classifyScene(c.scene);
    const accepted = [c.expected, ...(c.alternates || [])];
    const ok = result.renderSystemType === c.expected;
    const altOk = !ok && accepted.includes(result.renderSystemType);
    const label = ok ? 'PASS' : altOk ? 'PASS (alt)' : 'FAIL';
    if (ok) pass++;
    else if (altOk) acceptable++;
    else fail++;
    console.log(
      `  [${label}] ${c.label}\n     expected: ${c.expected}${c.alternates && c.alternates.length ? ` (or: ${c.alternates.join(', ')})` : ''}\n     got:      ${fmt(result)}`,
    );
  }

  console.log(
    `\n[verify-scene-classifier] summary: ${pass} pass, ${acceptable} pass-alt, ${fail} fail (of ${CASES.length})`,
  );
  return fail === 0 ? 0 : 1;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error('[verify-scene-classifier] crashed:', err);
    process.exit(1);
  });
