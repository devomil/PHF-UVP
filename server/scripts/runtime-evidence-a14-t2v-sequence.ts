/**
 * A1-4 core verification: T2V log-sequence probe.
 *
 * Confirms that for a T2V scene:
 *   1. resolveProviderOrder fires FIRST (logs intelligent-selector lines)
 *   2. [PromptEnhance] fires AFTER provider is resolved
 *   3. optimizePrompt uses the resolved normalizedProvider
 *   4. [AIVideo] Trying <provider> matches the family normalizedProvider was set to
 *
 * PiAPI stubbed — no credits spent.
 */

const _real = global.fetch;
(global as any).fetch = async (url: string, init?: RequestInit) => {
  const u = String(url);
  if (u.includes('piapi.ai')) {
    if (init?.method?.toUpperCase() === 'POST')
      return new Response(JSON.stringify({ data: { task_id: 'STUB_TASK' } }), { status: 200, headers: { 'content-type': 'application/json' } });
    return new Response(JSON.stringify({ data: { status: 'failed', error: { raw_message: 'STUB' } } }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  // LLM calls pass through (needed for intelligent provider selector + prompt enhancer)
  return _real(u, init);
};

import { aiVideoService } from '../services/ai-video-service.js';

console.log('\n=== A1-4 T2V SEQUENCE PROBE ===');
console.log('Expected order: resolveProviderOrder → [PromptEnhance] → optimizePrompt → [AIVideo] Trying');
console.log('Watch that the provider in [AIVideo] Trying matches normalizedProvider logged above it.\n');

// T2V scene — no imageUrl — exercises the T2V branch with enhanceVideoPrompt + optimizePrompt
await aiVideoService.generateVideo({
  prompt: 'A woman in her early thirties sits at a sun-drenched kitchen table with both hands wrapped around a ceramic mug, steam curling upward.',
  narration: 'The quiet moments are the ones that last.',
  sceneType: 'broll',
  visualStyle: 'lifestyle',
  qualityTier: 'standard',
  // NO imageUrl → T2V path
} as any).catch(() => {/* expected — stub aborts early */});

console.log('\n=== SEQUENCE PROBE DONE ===');
