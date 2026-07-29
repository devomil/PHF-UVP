/**
 * A1-1 REAL RUNTIME EVIDENCE
 * Calls piapiVideoService.generateImageToVideo() directly.
 * buildI2VRequestBody() is synchronous and emits cfg= BEFORE fetch is called.
 * We stub fetch only for the PiAPI /task POST endpoint so no video credits are spent;
 * the full Kling I2V logic (CFG_BY_ANIMATION_STYLE, sentinel check, action prompt
 * detection, stylized floor) all execute from the real production code.
 *
 * Run with: npx tsx server/scripts/runtime-evidence-a1-1.ts
 */

// Real env vars — PIAPI_API_KEY is read from process.env automatically
process.env.REMOTION_AWS_ACCESS_KEY_ID ??= 'test';
process.env.REMOTION_AWS_SECRET_ACCESS_KEY ??= 'test';
process.env.REMOTION_AWS_REGION ??= 'us-east-2';
process.env.REMOTION_S3_BUCKET ??= 'test-bucket';

const PIAPI_TASK_RE = /\/task\b/;
const origFetch = globalThis.fetch;
(globalThis as any).fetch = async (url: any, opts?: any) => {
  const urlStr = String(url);
  if (PIAPI_TASK_RE.test(urlStr)) {
    if (opts?.method === 'POST') {
      // Stub task submission — no video credits spent
      return {
        ok: true, status: 200,
        json: async () => ({ data: { task_id: 'STUBBED_NO_CREDITS' } }),
        text: async () => '{"data":{"task_id":"STUBBED_NO_CREDITS"}}',
      } as any;
    }
    // Stub status-check GET — return immediate failure so polling terminates
    return {
      ok: true, status: 200,
      json: async () => ({ data: { status: 'failed', error: 'STUB_TEST_ABORT' } }),
      text: async () => '{"data":{"status":"failed","error":"STUB_TEST_ABORT"}}',
    } as any;
  }
  return origFetch(url, opts);
};

import { piapiVideoService } from '../services/piapi-video-service.js';

// Stable public image URL (Unsplash photo, no CORS issues for server-side fetch)
const TEST_IMAGE = 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=800';

const cases: Array<{ label: string; opts: Parameters<typeof piapiVideoService.generateImageToVideo>[0] }> = [
  {
    label: 'CASE 1 — Normal pipeline scene (no i2vSettings)',
    opts: {
      imageUrl: TEST_IMAGE,
      prompt: 'A woman stands in a sunlit kitchen, steam rising from a fresh cup of coffee. She gazes thoughtfully out the window.',
      duration: 5,
      aspectRatio: '16:9',
      model: 'kling-2.6',
      // i2vSettings intentionally absent — simulates pipeline I2V scene
    },
  },
  {
    label: 'CASE 2 — Action-heavy pipeline scene (no i2vSettings, action prompt)',
    opts: {
      imageUrl: TEST_IMAGE,
      prompt: 'Water explodes upward in a dramatic burst, droplets scatter and cascade across the frame with explosive high energy and force.',
      duration: 5,
      aspectRatio: '16:9',
      model: 'kling-2.6',
    },
  },
  {
    label: 'CASE 3 — Asset Library max fidelity (imageControlStrength = 1)',
    opts: {
      imageUrl: TEST_IMAGE,
      prompt: 'The product glows warmly on a sleek marble surface, subtle reflections dancing across the label.',
      duration: 5,
      aspectRatio: '16:9',
      model: 'kling-2.6',
      i2vSettings: { imageControlStrength: 1 },
    },
  },
  {
    label: 'CASE 4 — Stylized character-reference (artPresetId=3d-illustration, isCharacterReference=true)',
    opts: {
      imageUrl: TEST_IMAGE,
      prompt: 'A young woman with bright eyes smiles and waves. The scene has a warm, friendly atmosphere.',
      duration: 5,
      aspectRatio: '16:9',
      model: 'kling-2.6',
      artPresetId: '3d-illustration',
      isCharacterReference: true,
    },
  },
];

console.log('\n=== A1-1 REAL RUNTIME EVIDENCE ===');
console.log(`Using model: kling-2.6 | fetch to /task is stubbed (no credits spent)\n`);

for (const { label, opts } of cases) {
  console.log(`\n--- ${label} ---`);
  try {
    await piapiVideoService.generateImageToVideo(opts);
  } catch (err: any) {
    // Expected: polling or downstream code may error after the stub — irrelevant,
    // the cfg= log fires synchronously before fetch is ever called.
    if (!String(err?.message || err).includes('STUBBED')) {
      console.log(`[expected downstream error after stub: ${err?.message?.slice(0, 80)}]`);
    }
  }
}

console.log('\n=== A1-1 done — scan above for [PiAPI I2V] cfg= lines ===\n');
