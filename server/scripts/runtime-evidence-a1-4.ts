/**
 * A1-4 real runtime evidence.
 *
 * Two required reports from the full generateVideo() pipeline:
 *   1. One [PiAPI I2V] cfg=... via ... line from a genuine pipeline I2V scene.
 *   2. Which provider a stylized character-reference I2V scene routes to (Kling or Seedance 2).
 *
 * PiAPI task POST/GET stubbed via fetch patch — no real credits spent.
 */

// ── Stub fetch before any imports touch PiAPI ─────────────────────────────────
const _realFetch = global.fetch;
(global as any).fetch = async (url: string, init?: RequestInit) => {
  const u = String(url);
  if (u.includes('piapi.ai') && u.includes('/task') && (!init?.method || init.method === 'GET')) {
    return new Response(
      JSON.stringify({ data: { status: 'failed', error: { raw_message: 'STUB_ABORT' } } }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }
  if (u.includes('piapi.ai') && init?.method?.toUpperCase() === 'POST') {
    return new Response(
      JSON.stringify({ data: { task_id: 'STUB_NO_VIDEO_CREDITS' } }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }
  // Pass LLM calls (api.anthropic.com / PiAPI LLM) through for real.
  return _realFetch(u, init);
};

import { aiVideoService as svc } from '../services/ai-video-service.js';

// ── Scene 1: genuine pipeline I2V (no i2vSettings, no fidelity slider) ────────
console.log('\n=== SCENE 1: Pipeline I2V — broll lifestyle, no i2vSettings ===\n');

await svc.generateVideo({
  prompt: 'A woman in her mid-thirties sits at a sun-drenched kitchen table, both hands wrapped around a ceramic mug, steam curling upward. Morning light streams through sheer curtain fabric behind her.',
  narration: 'The quiet moments are the ones that last.',
  sceneType: 'broll',
  imageUrl: 'https://example.com/test-frame.jpg',   // I2V mode trigger
  visualStyle: 'lifestyle',
  qualityTier: 'standard',
  // NO i2vSettings — tests A1-1 default path in production code
} as any);

// ── Scene 2: stylized character-reference I2V ─────────────────────────────────
console.log('\n=== SCENE 2: Stylized character-reference I2V — 3d-illustration ===\n');

await svc.generateVideo({
  prompt: 'Elena Vasquez (late-20s woman, dark braided hair, wearing an emerald explorer jacket) stands at the edge of a cliff overlooking a vast valley.',
  narration: 'Every summit reveals a new horizon.',
  sceneType: 'broll',
  imageUrl: 'https://example.com/char-ref.jpg',    // I2V mode trigger
  artPresetId: '3d-illustration',                  // stylized preset
  isCharacterReference: true,
  visualStyle: 'lifestyle',
  qualityTier: 'standard',
} as any);

console.log('\n=== A1-4 done ===');
console.log('Look for:');
console.log('  Scene 1: [PiAPI I2V] cfg=<N> via <source>  (should NOT say "via user fidelity slider")');
console.log('  Scene 2: first [AIVideo] Trying <provider>  (Kling or Seedance 2, not Veo/Sora)');
