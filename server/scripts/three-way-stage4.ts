/**
 * Three-way comparison — Phase A2 Decision Experiment
 *
 * Step 1: Run the full script pipeline (Stage 4) on a 3-scene topic.
 *         Saves scenes to /tmp/three-way-scenes.json.
 * Run this first, then run three-way-A.ts / three-way-B.ts / three-way-C.ts.
 */
import * as fs from 'fs';
import { runScriptPipeline } from '../services/script-pipeline-service';
import type { PipelineContext } from '../services/script-pipeline-service';

const ctx: PipelineContext = {
  topic: 'A new premium Chicago restaurant concept that blends rare whiskey bar culture with a members-only private dining experience',
  targetDuration: 15,
  platform: 'Instagram',
  targetAudience: 'Sophisticated urban professionals aged 28-45',
  artPresetId: 'cinematic-realism',
  numScenes: 3,
};

console.log('[Stage4] Starting 4-stage script pipeline...');
const t0 = Date.now();

try {
  const result = await runScriptPipeline(ctx);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[Stage4] Pipeline complete in ${elapsed}s — ${result.scenes.length} scenes`);

  for (const [i, sc] of result.scenes.entries()) {
    const ipW = (sc.imagePrompt || '').trim().split(/\s+/).filter(Boolean).length;
    const vdW = (sc.visualDirection || '').trim().split(/\s+/).filter(Boolean).length;
    const mpW = (sc.motionPrompt || '').trim().split(/\s+/).filter(Boolean).length;

    console.log(`\n--- Scene ${i + 1} (${sc.type}) ---`);
    console.log(`imagePrompt  (${ipW}w): "${sc.imagePrompt || '(none)'}"`);
    console.log(`visualDir    (${vdW}w): "${sc.visualDirection || '(none)'}"`);
    console.log(`motionPrompt (${mpW}w): "${sc.motionPrompt || '(none)'}"`);

    // Also show micro-scenes if any
    const mss = (sc as any).microScenes || [];
    for (const [j, ms] of mss.entries()) {
      const mipW = (ms.imagePrompt || '').trim().split(/\s+/).filter(Boolean).length;
      const mvdW = (ms.visualDirection || '').trim().split(/\s+/).filter(Boolean).length;
      const mmpW = (ms.motionPrompt || '').trim().split(/\s+/).filter(Boolean).length;
      console.log(`  micro-${j + 1}: ip=${mipW}w vd=${mvdW}w mp=${mmpW}w — "${(ms.motionPrompt || ms.visualDirection || '').substring(0, 60)}"`);
    }
  }

  fs.writeFileSync('/tmp/three-way-scenes.json', JSON.stringify(result.scenes, null, 2));
  console.log('\n[Stage4] Scenes written to /tmp/three-way-scenes.json');
} catch (err: any) {
  console.error('[Stage4] FATAL:', err?.message);
  console.error(err?.stack?.substring(0, 500));
}
process.exit(0);
