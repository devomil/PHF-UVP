/**
 * A/B Optimizer measurement — REAL generation.
 *
 * Runs the 30-word (normal/optimized) and 59-word (bypass/pre-optimizer) prompts
 * through seedance-2.0 T2V for real. Both calls use the same model, duration, and
 * aspect ratio — the only variable is the prompt string.
 *
 * Do NOT commit the bypass change; this script reads prompts directly.
 * No changes to ai-video-service.ts or video-prompt-optimizer.ts.
 */

import { piapiVideoService } from '../services/piapi-video-service.js';

// ── Prompts from the measurement run ──────────────────────────────────────────
const NORMAL_PROMPT =
  'A woman in her early thirties with dark curly hair, wearing a soft sage green linen blouse, sits at a sunlit wooden kitchen table with her hands wrapped around a.';
// ^ 30 words — enforcePromptLength(maxWords=30) output, hard word-slice

const BYPASS_PROMPT =
  'A woman in her early thirties with dark curly hair, wearing a soft sage green linen blouse, sits at a sunlit wooden kitchen table with her hands wrapped around a ceramic mug. Steam rises gently from the mug. Outside the window behind her, morning light filters through dappled leaves. A small succulent plant sits beside her on the table.';
// ^ 59 words — enhanced.prompt used directly (pre-optimizer string)

const MODEL = 'seedance-2.0';
const DURATION = 5;
const ASPECT = '16:9' as const;

async function generate(label: string, prompt: string) {
  const words = prompt.split(/\s+/).length;
  console.log(`\n--- ${label} (${words} words) ---`);
  console.log(`Prompt: "${prompt}"`);
  console.log(`Model: ${MODEL} | Duration: ${DURATION}s | Aspect: ${ASPECT}`);
  console.log('Generating...');

  const result = await piapiVideoService.generateVideo({
    prompt,
    model: MODEL,
    duration: DURATION,
    aspectRatio: ASPECT,
  });

  if (result.success) {
    const url = result.s3Url || result.videoUrl;
    console.log(`✓ Success — ${label}`);
    console.log(`  Video URL: ${url}`);
    return url;
  } else {
    console.error(`✗ Failed — ${label}: ${result.error}`);
    return null;
  }
}

async function run() {
  console.log('\n=== A/B OPTIMIZER — REAL GENERATION ===');
  console.log(`Model fixed to: ${MODEL}`);
  console.log(`Normal  (optimized):  ${NORMAL_PROMPT.split(/\s+/).length} words`);
  console.log(`Bypass  (pre-optim):  ${BYPASS_PROMPT.split(/\s+/).length} words`);

  const normalUrl = await generate('NORMAL (30-word optimized)', NORMAL_PROMPT);
  const bypassUrl = await generate('BYPASS (59-word pre-optimizer)', BYPASS_PROMPT);

  console.log('\n=== RESULTS ===');
  console.log(`Model: ${MODEL} (same for both) ✓`);
  console.log(`Normal  URL: ${normalUrl ?? 'FAILED'}`);
  console.log(`Bypass  URL: ${bypassUrl ?? 'FAILED'}`);
  console.log(`\nNormal prompt  (${NORMAL_PROMPT.split(/\s+/).length} words): "${NORMAL_PROMPT}"`);
  console.log(`Bypass prompt  (${BYPASS_PROMPT.split(/\s+/).length} words): "${BYPASS_PROMPT}"`);
}

run().catch(console.error);
