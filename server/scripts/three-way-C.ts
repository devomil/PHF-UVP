/**
 * Three-way comparison — Run C: direct-t2v with enforcePromptLength bypassed
 *
 * Sets BYPASS_PROMPT_CAP=1 so the 30-word cap in enforcePromptLength is skipped.
 * enhanceVideoPrompt and provider selection still run normally.
 * Uses explicit 'direct-t2v' to prevent cinematic-realism preset from overriding.
 */
import * as fs from 'fs';
process.env.BYPASS_PROMPT_CAP = '1';  // must be set before the service imports run
import { universalVideoService } from '../services/universal-video-service';
import type { VideoProject } from '../../shared/schema';

const scenes = JSON.parse(fs.readFileSync('/tmp/three-way-scenes.json', 'utf8'));
const start = Date.now();

const project: any = {
  projectId: `three-way-C-${Date.now()}`,
  id: 88883,
  ownerId: 1,
  title: 'Three-way C — direct-T2V, optimizer bypassed',
  description: 'Phase A2 comparison',
  targetAudience: 'Sophisticated urban professionals',
  totalDuration: 15,
  fps: 30,
  outputFormat: { aspectRatio: '9:16', resolution: { width: 1080, height: 1920 }, platform: 'Instagram' },
  brand: {},
  assets: { voiceover: { fullTrackUrl: '', duration: 0, perScene: [] }, music: { url: '', volume: 0.18, duration: 0 }, images: [], videos: [] },
  progress: {},
  status: 'draft',
  qualityTier: 'standard',
  mediaMode: 'video',
  videoGenerationMode: 'direct-t2v',   // ← explicit T2V, same as A's T2V path
  voiceStyle: null,
  characters: [],
  artPresetId: 'cinematic-realism',
  scenes,
};

console.log(`[ThreeWay-C] Starting direct-T2V bypass run at ${new Date().toISOString()}`);
console.log(`[ThreeWay-C] Scenes: ${scenes.length}, videoGenerationMode: direct-t2v, BYPASS_PROMPT_CAP: ${process.env.BYPASS_PROMPT_CAP}`);

try {
  const result = await universalVideoService.generateProjectAssets(project as VideoProject, {
    skipMusic: true,
    onProgress: async (proj) => {
      const pct = (proj.progress as any)?.overallPercent ?? '?';
      const step = (proj.progress as any)?.currentStep ?? '?';
      process.stdout.write(`[ThreeWay-C] ${pct}% — ${step}\n`);
    },
  });

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n[ThreeWay-C] === RESULTS (${elapsed}s) ===`);
  const vids = result.assets?.videos || [];
  for (const v of vids) {
    console.log(`[ThreeWay-C] ${v.sceneId}: provider=${v.source || (v as any).provider || '?'} url=${String(v.url || '').substring(0, 100)}`);
  }
  console.log(`[ThreeWay-C] Failures:`, JSON.stringify((result.progress as any)?.serviceFailures || []));
} catch (err: any) {
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.error(`[ThreeWay-C] FATAL after ${elapsed}s:`, err?.message);
}
process.exit(0);
