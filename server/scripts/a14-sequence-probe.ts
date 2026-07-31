/**
 * A1-4 ordering probe — captures only sequencing-relevant log lines.
 * PiAPI stubbed; LLM calls pass through for real provider selection.
 */
const _real = global.fetch;
(global as any).fetch = async (url: string, init?: RequestInit) => {
  if (String(url).includes('piapi.ai')) {
    if (init?.method?.toUpperCase() === 'POST')
      return new Response(JSON.stringify({ data: { task_id: 'STUB' } }), { status: 200, headers: { 'content-type': 'application/json' } });
    return new Response(JSON.stringify({ data: { status: 'failed', error: { raw_message: 'STUB' } } }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  return _real(url, init);
};

const orig = console.log.bind(console);
const seqLines: string[] = [];
(console as any).log = (...a: any[]) => {
  const m = String(a[0] ?? '');
  const keep =
    m.includes('[IntelligentProvider]') ||
    m.includes('[AIVideo] Intelligent') ||
    m.includes('[AIVideo] Art style hierarchy') ||
    m.includes('[PromptEnhance]') ||
    m.includes('[AIVideo] Enhanced prompt') ||
    m.includes('[PromptOptimizer] Input') ||
    m.includes('[PromptOptimizer] Output') ||
    m.includes('[AIVideo] Trying ');
  if (keep) { orig(m); seqLines.push(m); }
};
(console as any).warn = (...a: any[]) => {};
(console as any).error = (...a: any[]) => {};

import { aiVideoService } from '../services/ai-video-service.js';

async function run() {
  await aiVideoService.generateVideo({
    prompt: 'A woman sits at a sunlit kitchen table, hands wrapped around a ceramic mug.',
    narration: 'The quiet moments are the ones that last.',
    sceneType: 'broll',
    visualStyle: 'lifestyle',
    qualityTier: 'standard',
  } as any).catch(() => {});

  orig('\n=== SEQUENCE ORDER (chronological) ===');
  seqLines.forEach((l, i) => orig(`${String(i + 1).padStart(2, '0')}. ${l}`));
}
run().catch(console.error);
