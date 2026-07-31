/**
 * A1-4 Scene 1 probe: capture [PiAPI I2V] cfg= from the Kling I2V path.
 * Stubs fetch so tasks fail immediately — no credits spent.
 */
const _real = global.fetch;
(global as any).fetch = async (url: string, init?: RequestInit) => {
  const u = String(url);
  if (u.includes('piapi.ai')) {
    if (init?.method?.toUpperCase() === 'POST')
      return new Response(JSON.stringify({ data: { task_id: 'STUB_TASK' } }), { status: 200, headers: { 'content-type': 'application/json' } });
    // GET → immediate fail so poll exits
    return new Response(JSON.stringify({ data: { status: 'failed', error: { raw_message: 'STUB' } } }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  return _real(u, init);
};

import { piapiVideoService } from '../services/piapi-video-service.js';

console.log('\n=== A1-4 Scene 1: Kling I2V cfg= probe (no i2vSettings) ===\n');
console.log('Provider: kling-2.6 | No i2vSettings → A1-1 default path\n');

try {
  await piapiVideoService.generateImageToVideo({
    prompt: 'A woman in her mid-thirties sits at a sun-drenched kitchen table, both hands wrapped around a ceramic mug.',
    imageUrl: 'https://example.com/test-frame.jpg',
    model: 'kling-2.6',
    duration: 5,
    aspectRatio: '16:9',
    // NO i2vSettings — pipeline default path
  });
} catch (_) {
  // expected — stub causes failure
}

console.log('\n(look for [PiAPI I2V] cfg=... line above)');
