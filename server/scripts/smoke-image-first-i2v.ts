/**
 * Smoke test: image-first-i2v end-to-end
 *
 * Uses a real 2-scene minimal project so we exercise T2I→I2V routing
 * without hitting all 11 scenes of a production project.
 *
 * Reports: failures (real error), T2I provider per scene, wall-clock, cost.
 */
import { universalVideoService } from '../services/universal-video-service';
import type { VideoProject } from '../../shared/schema';

const start = Date.now();

// Minimal 2-scene project with real narration + visual direction (no imagePrompt/motionPrompt
// so we confirm the pipeline generates them through T2I and then routes I2V).
const testProject: any = {
  projectId: `smoke-i2v-${Date.now()}`,
  id: 99999,
  ownerId: 1,
  title: 'Smoke Test — image-first-i2v',
  description: 'Automated smoke test',
  targetAudience: 'general',
  totalDuration: 8,
  fps: 30,
  outputFormat: { aspectRatio: '16:9', resolution: { width: 1920, height: 1080 }, platform: 'YouTube' },
  brand: {},
  assets: { voiceover: { fullTrackUrl: '', duration: 0, perScene: [] }, music: { url: '', volume: 0.18, duration: 0 }, images: [], videos: [] },
  progress: {},
  status: 'draft',
  qualityTier: 'standard',
  mediaMode: 'video',
  videoGenerationMode: 'image-first-i2v',
  voiceStyle: null,
  characters: [],
  scenes: [
    {
      id: 'smoke-scene-1',
      type: 'content',
      title: 'Scene 1',
      narration: 'A confident entrepreneur reviews her morning metrics at a sleek standing desk.',
      visualDirection: 'Medium shot of a woman in her early thirties at a standing desk, morning light through floor-to-ceiling windows, city skyline behind. Clean modern loft interior. Warm golden hour light. 85mm lens, shallow depth of field.',
      duration: 4,
      order: 0,
    },
    {
      id: 'smoke-scene-2',
      type: 'content',
      title: 'Scene 2',
      narration: 'Her dashboard shows record growth. The numbers do not lie.',
      visualDirection: 'Close-up of laptop screen showing clean dashboard with upward trending charts. Blue accent UI. Hands typing. Blurred background office. Cinematic depth of field, cool color grade.',
      duration: 4,
      order: 1,
    },
  ],
};

console.log(`[Smoke] Starting image-first-i2v smoke test at ${new Date().toISOString()}`);
console.log(`[Smoke] Project: ${testProject.projectId}`);
console.log(`[Smoke] Scene count: ${testProject.scenes.length}`);
console.log(`[Smoke] videoGenerationMode: ${testProject.videoGenerationMode}`);
console.log();

try {
  const result = await universalVideoService.generateProjectAssets(testProject as VideoProject, {
    skipMusic: true,
    onProgress: async (proj) => {
      const pct = (proj.progress as any)?.overallPercent ?? '?';
      const step = (proj.progress as any)?.currentStep ?? '?';
      console.log(`[Smoke] Progress: ${pct}% — ${step}`);
    },
  });

  const elapsedSec = ((Date.now() - start) / 1000).toFixed(1);
  console.log();
  console.log(`[Smoke] ========== RESULTS ==========`);
  console.log(`[Smoke] Wall-clock: ${elapsedSec}s`);
  console.log(`[Smoke] Failures (serviceFailures):`, JSON.stringify((result.progress as any)?.serviceFailures || [], null, 2));

  for (const scene of result.scenes) {
    const bg = (scene.background as any);
    const assets = (scene.assets as any);
    console.log(`[Smoke] Scene ${scene.id}:`);
    console.log(`  bg.source: ${String(bg?.source || '').substring(0, 100)}`);
    console.log(`  assets.imageUrl: ${String(assets?.imageUrl || '(none)').substring(0, 100)}`);
    console.log(`  assets.videoUrl / videos[0]: ${String(assets?.videoUrl || result.assets?.videos?.find((v: any) => v.sceneId === scene.id)?.url || '(none)').substring(0, 100)}`);
  }

  const imgs = result.assets?.images || [];
  console.log();
  console.log(`[Smoke] Generated images (T2I):`, imgs.map((i: any) => `${i.sceneId}: ${i.provider || 'unknown'} → ${String(i.url || '').substring(0, 80)}`));

  const vids = result.assets?.videos || [];
  console.log(`[Smoke] Generated videos (I2V):`, vids.map((v: any) => `${v.sceneId}: ${v.provider || v.source || 'unknown'} → ${String(v.url || '').substring(0, 80)}`));

  console.log();
  console.log(`[Smoke] Overall status: ${(result.progress as any)?.phase || 'unknown'}`);
  console.log(`[Smoke] Cost estimate: check server logs for aiVideosGenerated / credit lines`);

} catch (err: any) {
  const elapsedSec = ((Date.now() - start) / 1000).toFixed(1);
  console.error(`[Smoke] FATAL ERROR after ${elapsedSec}s:`, err?.message || err);
  console.error(`[Smoke] Stack:`, err?.stack?.substring(0, 500));
}

process.exit(0);
