// Phase 23A (Task #118): Manual verification script for the Claude Haiku
// scene classifier. Hits the live Anthropic API with five canonical scenes
// drawn from the Pine Hill Farm "Deep Dive" reference deck.
//
// Mandatory pre-flight (per task spec): refuse to run when
// `ANTHROPIC_API_KEY` is unset. Without it, every classify call falls
// back to `ai_video`, and the lifestyle case below would falsely "pass"
// while masking a total classifier outage on the other four cases.
//
// Mirrors `scripts/manual/verify-nb2-web-search.ts` from Task #107.
//
// Usage: `npx tsx scripts/manual/verify-scene-classifier.ts`

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('[verify] ANTHROPIC_API_KEY is unset — aborting.');
  console.error('[verify] Without a key, every scene falls back to');
  console.error('[verify] ai_video and 4 of 5 cases would falsely pass.');
  process.exit(1);
}

import {
  classifyScene,
  SCENE_CLASSIFIER_MODEL,
  type ClassifierResult,
} from '../../server/services/scene-classifier.service';
import type { RenderSystemType } from '../../shared/video-types';

interface VerifyCase {
  label: string;
  expected: RenderSystemType;
  scene: {
    sceneId: string;
    sceneType?: string;
    narration?: string;
    visualDirection?: string;
  };
}

const CASES: VerifyCase[] = [
  {
    label: 'Pine Hill Week-1 title scene',
    expected: 'title_card',
    scene: {
      sceneId: 'verify_title',
      sceneType: 'intro',
      narration: 'Welcome to Pine Hill Farm Deep Dive. Week One: Foundations.',
      visualDirection:
        'Centered serif title text on a clean cream background. Small farm icon below the title. No motion, no people, no products.',
    },
  },
  {
    label: 'Sugar Problem comparison',
    expected: 'infographic',
    scene: {
      sceneId: 'verify_infographic',
      sceneType: 'problem',
      narration:
        'Most snack bars contain twenty-three grams of added sugar. Ours contain three.',
      visualDirection:
        'Side-by-side bar chart comparing 23g sugar vs 3g sugar, large numeric callouts, comparison ticks, brand colors',
    },
  },
  {
    label: 'Blood-glucose response curve',
    expected: 'scientific_medical',
    scene: {
      sceneId: 'verify_medical',
      sceneType: 'explanation',
      narration:
        'Blood glucose spikes within thirty minutes of a sugary snack, crashing two hours later.',
      visualDirection:
        'Animated line chart of blood glucose over time, axis labels in mg/dL and minutes, clinical illustration style with reference range overlay',
    },
  },
  {
    label: 'Origin Holistic at Pine Hill Farm',
    expected: 'brand_environment',
    scene: {
      sceneId: 'verify_brand_env',
      sceneType: 'product',
      narration: 'Origin Holistic, crafted at Pine Hill Farm.',
      visualDirection:
        'Wide shot of the farm storefront. Pine Hill Farm signage above the door, branded packaging displayed in the window. Warm afternoon light, no people in frame.',
    },
  },
  {
    label: 'Lifestyle B-roll',
    expected: 'ai_video',
    scene: {
      sceneId: 'verify_lifestyle',
      sceneType: 'lifestyle',
      narration: 'Real people, real moments — sunrise hike with a friend.',
      visualDirection:
        'Cinematic golden-hour shot of two friends hiking a forest trail, gentle camera dolly forward, natural movement, no text, no charts',
    },
  },
];

function fmt(r: ClassifierResult): string {
  return `${r.renderSystemType} (conf=${r.confidence.toFixed(2)})  ${r.reasoning}`;
}

async function main(): Promise<number> {
  console.log(`[verify] model=${SCENE_CLASSIFIER_MODEL}`);
  console.log(`[verify] running ${CASES.length} canonical Pine Hill Farm cases...`);

  let pass = 0;
  let fail = 0;

  for (const c of CASES) {
    const result = await classifyScene(c.scene);
    const ok = result.renderSystemType === c.expected;
    const mark = ok ? '✅' : '❌';
    if (ok) pass++; else fail++;
    console.log(
      `  ${mark} ${c.label}\n     expected: ${c.expected}\n     got:      ${fmt(result)}`,
    );
  }

  console.log(`\n[verify] summary: ${pass}/${CASES.length} passed, ${fail} failed`);
  return fail === 0 ? 0 : 1;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error('[verify] crashed:', err);
    process.exit(1);
  });
