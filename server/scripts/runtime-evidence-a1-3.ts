/**
 * A1-3 REAL RUNTIME EVIDENCE
 * Calls aiVideoService.generateVideo() with a cinematic scene and NO explicit provider.
 * LLM call (for intelligent provider selection) runs for real against PiAPI.
 * Only the final video-task POST is stubbed — no video credits are spent.
 *
 * Captures:
 *   [AIVideo] Intelligent selector constraint: [...]
 *   [IntelligentProvider] Scene N: <provider> | ...
 *   Whether ⚡ Runway blocked fires (it must NOT)
 *   What provider Claude recommended
 *
 * Run with: npx tsx server/scripts/runtime-evidence-a1-3.ts
 */

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
      return {
        ok: true, status: 200,
        json: async () => ({ data: { task_id: 'STUB_NO_VIDEO_CREDITS' } }),
        text: async () => '{"data":{"task_id":"STUB_NO_VIDEO_CREDITS"}}',
      } as any;
    }
    // Status-check GET — immediate failure so polling terminates
    return {
      ok: true, status: 200,
      json: async () => ({ data: { status: 'failed', error: 'STUB_ABORT' } }),
      text: async () => '{"data":{"status":"failed","error":"STUB_ABORT"}}',
    } as any;
  }
  return origFetch(url, opts);
};

import { aiVideoService } from '../services/ai-video-service.js';

// Cinematic scene — the content type that previously caused Claude to recommend
// Runway (which was then silently discarded by runwaySafeOrder).
const cinematicScene = {
  prompt: 'Epic wide-angle shot of a lone climber ascending a sheer granite face at golden hour. The valley below is bathed in warm amber light, clouds drift far below. Cinematic depth of field, sweeping dramatic scale.',
  narration: 'Against every obstacle, the human spirit finds a way to rise. One step at a time, the impossible becomes inevitable.',
  duration: 6,
  aspectRatio: '16:9' as const,
  sceneType: 'cinematic',
  // NO preferredProvider — forces intelligent selection path
};

console.log('\n=== A1-3 REAL RUNTIME EVIDENCE ===');
console.log('LLM call runs for real. Video task POST is stubbed.\n');
console.log(`Scene: ${cinematicScene.prompt.substring(0, 80)}...\n`);

try {
  await aiVideoService.generateVideo(cinematicScene);
} catch (err: any) {
  // Expected after the stub response — doesn't affect the logs we need
  if (!String(err?.message || err).includes('STUBBED')) {
    console.log(`[downstream error after stub — expected: ${String(err?.message || err).slice(0, 100)}]`);
  }
}

console.log('\n=== A1-3 done ===');
console.log('Look for:');
console.log('  [AIVideo] Intelligent selector constraint: [...]');
console.log('  [IntelligentProvider] Scene 1: <provider> | ...');
console.log('  Confirm: NO "⚡ Runway provider blocked" line\n');
