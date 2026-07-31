/**
 * A/B Optimizer measurement — measurement only, nothing committed.
 *
 * Demonstrates the quality difference between:
 *   Normal: enhanced.prompt → optimizePrompt → finalPrompt (≤30 words)
 *   Bypass: enhanced.prompt used directly (pre-optimizer string)
 *
 * Both runs use the same provider (seedance-2.0).
 * No real video generation — prompts logged and compared.
 */

import { promptEnhancementService } from '../services/prompt-enhancement-service';
import { optimizePrompt, logPromptOptimization } from '../services/video-prompt-optimizer';

const FIXED_PROVIDER = 'seedance-2.0';
const FIXED_PROVIDER_FAMILY = 'seedance';

// A non-stylized Seedance scene — B-roll lifestyle
const INPUT = {
  prompt: 'A woman in her early thirties with dark curly hair, wearing a soft sage green linen blouse, sits at a sunlit wooden kitchen table with her hands wrapped around a ceramic mug. Steam rises gently from the mug. Outside the window behind her, morning light filters through dappled leaves. A small succulent plant sits beside her on the table.',
  sceneType: 'broll',
  narration: 'When you finally slow down, you rediscover what really matters.',
  mood: 'warm, peaceful, reflective',
  visualStyle: 'lifestyle',
};

async function run() {
  console.log('\n=== A/B OPTIMIZER MEASUREMENT ===\n');
  console.log(`Provider fixed to: ${FIXED_PROVIDER} (family: ${FIXED_PROVIDER_FAMILY})`);
  console.log(`Input prompt: ${INPUT.prompt.split(/\s+/).length} words\n`);

  // ── STEP 1: Enhance ──────────────────────────────────────────────────────
  console.log('--- Enhance step ---');
  const enhanced = await promptEnhancementService.enhanceVideoPrompt(
    INPUT.prompt,
    {
      sceneType: INPUT.sceneType,
      narration: INPUT.narration,
      mood: INPUT.mood,
      contentType: 'lifestyle',
      excludeElements: [],
    }
  );
  console.log(`Enhanced prompt: ${enhanced.prompt.split(/\s+/).length} words`);
  console.log(`Enhanced verbatim: "${enhanced.prompt}"\n`);

  // ── STEP 2: NORMAL PATH — optimizer runs ─────────────────────────────────
  console.log('--- Normal path (with optimizer) ---');
  const optimized = optimizePrompt({
    visualDescription: enhanced.prompt,
    sceneType: INPUT.sceneType,
    includeProduct: false,
    productName: 'product',
    visualStyle: INPUT.visualStyle,
    generationMode: 't2v',
    provider: FIXED_PROVIDER_FAMILY,
    artPresetId: undefined,
  });
  logPromptOptimization(INPUT.prompt, optimized);
  const normalPrompt = optimized.prompt;
  const normalWords = normalPrompt.split(/\s+/).length;

  console.log(`\n[A/B] NORMAL FINAL PROMPT (${normalWords} words):`);
  console.log(`"${normalPrompt}"`);
  console.log(`Provider: ${FIXED_PROVIDER}`);
  console.log(`Video URL: STUB (no real generation in evidence script)\n`);

  // ── STEP 3: BYPASS PATH — enhanced.prompt used directly ──────────────────
  console.log('--- Bypass path (optimizer skipped, enhanced.prompt used directly) ---');
  const bypassPrompt = enhanced.prompt;
  const bypassWords = bypassPrompt.split(/\s+/).length;

  console.log(`\n[A/B] BYPASS FINAL PROMPT (${bypassWords} words):`);
  console.log(`"${bypassPrompt}"`);
  console.log(`Provider: ${FIXED_PROVIDER}`);
  console.log(`Video URL: STUB (no real generation in evidence script)\n`);

  // ── STEP 4: Summary ───────────────────────────────────────────────────────
  console.log('=== SUMMARY ===');
  console.log(`Normal  (optimized):  ${normalWords} words`);
  console.log(`Bypass  (pre-optim):  ${bypassWords} words`);
  console.log(`Compression ratio:    ${(100 - (normalWords / bypassWords) * 100).toFixed(0)}% reduction`);
  console.log(`Same provider: ${FIXED_PROVIDER} ✓`);
}

run().catch(console.error);
