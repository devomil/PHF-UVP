/**
 * Three-way comparison — Run A: default T2V (videoGenerationMode unset)
 */
import * as fs from 'fs';
import { universalVideoService } from '../services/universal-video-service';
import type { VideoProject } from '../../shared/schema';

const scenes = JSON.parse(fs.readFileSync('/tmp/three-way-scenes.json', 'utf8'));
const start = Date.now();

const project: any = {
  projectId: `three-way-A-${Date.now()}`,
  id: 88881,
  ownerId: 1,
  title: 'Three-way A — default T2V',
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
  videoGenerationMode: null,   // ← default: direct T2V
  voiceStyle: null,
  characters: [],
  artPresetId: 'cinematic-realism',
  scenes,
};

console.log(`[ThreeWay-A] Starting T2V run at ${new Date().toISOString()}`);
console.log(`[ThreeWay-A] Scenes: ${scenes.length}, videoGenerationMode: null (default T2V)`);

try {
  const result = await universalVideoService.generateProjectAssets(project as VideoProject, {
    skipMusic: true,
    onProgress: async (proj) => {
      const pct = (proj.progress as any)?.overallPercent ?? '?';
      const step = (proj.progress as any)?.currentStep ?? '?';
      process.stdout.write(`[ThreeWay-A] ${pct}% — ${step}\n`);
    },
  });

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n[ThreeWay-A] === RESULTS (${elapsed}s) ===`);
  const vids = result.assets?.videos || [];
  for (const v of vids) {
    console.log(`[ThreeWay-A] ${v.sceneId}: provider=${v.source || v.provider || '?'} url=${String(v.url || '').substring(0, 100)}`);
  }
  console.log(`[ThreeWay-A] Failures:`, JSON.stringify((result.progress as any)?.serviceFailures || []));
} catch (err: any) {
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.error(`[ThreeWay-A] FATAL after ${elapsed}s:`, err?.message);
}
process.exit(0);
